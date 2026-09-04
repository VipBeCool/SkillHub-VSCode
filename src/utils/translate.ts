import * as https from 'https';

let googleFailedAt = 0;

function unescapeHtml(text: string): string {
    return text
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
}

/**
 * Translates text using Smart Dual-Engine (Google with MyMemory Domestic Fallback).
 * @param text The text to translate
 * @param targetLang The target language (default 'zh-CN')
 * @returns The translated text
 */
export async function translateText(text: string, targetLang: string = 'zh-CN'): Promise<string> {
    if (!text) return text;

    // 保护 Markdown 骨架：空行、代码块、分隔符原样保留；
    // 标题、列表行、正文行单独翻译，绝不合并，彻底杜绝换行符被翻译引擎吞噬粘连
    interface MarkdownItem {
        type: 'preserved' | 'translate';
        content: string;
    }

    const items: MarkdownItem[] = [];
    let inCodeBlock = false;

    for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('```')) {
            inCodeBlock = !inCodeBlock;
            items.push({ type: 'preserved', content: line });
            continue;
        }
        if (inCodeBlock || !trimmed || trimmed === '---') {
            items.push({ type: 'preserved', content: line });
            continue;
        }

        // 字符数 <= 350 直接独立处理，防止合并吞噬换行
        if (line.length <= 350) {
            items.push({ type: 'translate', content: line });
        } else {
            // 超长单行按标点符号切分
            let sub = '';
            for (const ch of line) {
                sub += ch;
                if (sub.length >= 300 && ['。', '.', '；', ';', ' ', '!'].includes(ch)) {
                    items.push({ type: 'translate', content: sub });
                    sub = '';
                }
            }
            if (sub) {
                items.push({ type: 'translate', content: sub });
            }
        }
    }

    const now = Date.now();
    let allowGoogle = (now - googleFailedAt) > 10 * 60 * 1000;

    let fullTranslatedText = '';

    for (const item of items) {
        if (item.type === 'preserved') {
            fullTranslatedText += item.content + '\n';
            continue;
        }

        const chunk = item.content;
        let translatedChunk: string | null = null;

        // 1. 尝试 Google 翻译（1.5 秒极速判定）
        if (allowGoogle) {
            try {
                translatedChunk = await translateChunkGoogle(chunk, targetLang);
                googleFailedAt = 0;
            } catch (err) {
                console.warn('[Translate] Google unavailable, switching to Tencent/MyMemory:', err);
                allowGoogle = false;
                googleFailedAt = Date.now();
            }
        }

        // 2. 若 Google 失败或处于熔断期，走国内主力源 (腾讯交互翻译 Tencent Transmart)
        if (!translatedChunk) {
            try {
                translatedChunk = await translateChunkTencent(chunk, targetLang);
            } catch (err) {
                console.warn('[Translate] Tencent provider failed, fallback to MyMemory:', err);
            }
        }

        // 3. 若腾讯也偶发失败，无缝走第三备选源 (MyMemory Neural)
        if (!translatedChunk) {
            try {
                translatedChunk = await translateChunkMyMemory(chunk, targetLang);
            } catch (err) {
                console.error('[Translate] MyMemory fallback provider also failed:', err);
                translatedChunk = chunk; // 兜底保留原文
            }
        }

        fullTranslatedText += (translatedChunk || chunk) + '\n';
    }

    return fullTranslatedText.trimEnd();
}

function translateChunkGoogle(text: string, targetLang: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const url = `https://translate.googleapis.com/translate_a/single?client=dict-chrome-ex&sl=auto&tl=${encodeURIComponent(targetLang)}&dt=t`;
        const body = `q=${encodeURIComponent(text)}`;

        const options: https.RequestOptions = {
            method: 'POST',
            timeout: 1500,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Content-Length': Buffer.byteLength(body)
            }
        };

        const req = https.request(url, options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    reject(new Error(`Google status ${res.statusCode}: ${data}`));
                    return;
                }
                try {
                    const json = JSON.parse(data);
                    let translated = '';
                    if (json && Array.isArray(json[0])) {
                        for (const item of json[0]) {
                            if (item && item[0]) {
                                translated += item[0];
                            }
                        }
                    }
                    if (!translated) {
                        reject(new Error('Empty result from Google'));
                        return;
                    }
                    resolve(translated);
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('timeout', () => {
            req.destroy(new Error('Google translate request timeout'));
        });
        req.on('error', (e) => reject(e));
        req.write(body);
        req.end();
    });
}

function translateChunkMyMemory(text: string, targetLang: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const langPair = targetLang.startsWith('zh') ? 'autodetect|zh-CN' : `autodetect|${targetLang}`;
        const url = 'https://api.mymemory.translated.net/get';
        const body = `q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(langPair)}`;

        const options: https.RequestOptions = {
            method: 'POST',
            timeout: 2500,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Content-Length': Buffer.byteLength(body)
            }
        };

        const req = https.request(url, options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    reject(new Error(`MyMemory status ${res.statusCode}: ${data}`));
                    return;
                }
                try {
                    const json = JSON.parse(data);
                    const translated = json?.responseData?.translatedText;
                    if (translated && !translated.startsWith('MYMEMORY WARNING:') && !translated.includes('QUERY LENGTH LIMIT')) {
                        resolve(unescapeHtml(translated));
                    } else {
                        reject(new Error('Invalid MyMemory response'));
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('timeout', () => {
            req.destroy(new Error('MyMemory request timeout'));
        });
        req.on('error', (e) => reject(e));
        req.write(body);
        req.end();
    });
}

function translateChunkTencent(text: string, targetLang: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const tgt = targetLang.startsWith('zh') ? 'zh' : targetLang;
        const url = 'https://transmart.qq.com/api/imt';
        const payload = JSON.stringify({
            header: {
                fn: 'auto_translation',
                client_key: 'browser-chrome-122.0.0-Mac_OS'
            },
            type: 'plain',
            model_category: 'normal',
            source: {
                lang: 'auto',
                text_list: [text]
            },
            target: {
                lang: tgt
            }
        });

        const options: https.RequestOptions = {
            method: 'POST',
            timeout: 2000,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Content-Length': Buffer.byteLength(payload)
            }
        };

        const req = https.request(url, options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    reject(new Error(`Tencent status ${res.statusCode}: ${data}`));
                    return;
                }
                try {
                    const json = JSON.parse(data);
                    if (json && Array.isArray(json.auto_translation) && json.auto_translation.length > 0) {
                        resolve(json.auto_translation.join(''));
                    } else {
                        reject(new Error('Invalid Tencent response'));
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('timeout', () => {
            req.destroy(new Error('Tencent request timeout'));
        });
        req.on('error', (e) => reject(e));
        req.write(payload);
        req.end();
    });
}
