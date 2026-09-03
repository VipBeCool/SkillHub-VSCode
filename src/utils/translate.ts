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

    const maxLen = 1000;
    const chunks: string[] = [];
    let currentChunk = '';

    // Split text into chunks to respect API length limits
    const lines = text.split('\n');
    for (const line of lines) {
        if (currentChunk.length + line.length + 1 > maxLen) {
            if (currentChunk.length > 0) {
                chunks.push(currentChunk);
                currentChunk = '';
            }
            if (line.length > maxLen) {
                let remaining = line;
                while (remaining.length > 0) {
                    chunks.push(remaining.substring(0, maxLen));
                    remaining = remaining.substring(maxLen);
                }
                continue;
            }
        }
        if (currentChunk.length > 0) {
            currentChunk += '\n';
        }
        currentChunk += line;
    }
    if (currentChunk.length > 0) {
        chunks.push(currentChunk);
    }

    const now = Date.now();
    // 若 10 分钟内 Google 判定不可用，直接跳过以避免每次等待 2.5 秒
    const isGoogleCooledDown = (now - googleFailedAt) > 10 * 60 * 1000;

    let fullTranslatedText = '';

    for (const chunk of chunks) {
        let translatedChunk: string | null = null;

        // 1. 尝试 Google 翻译（2.5 秒超时）
        if (isGoogleCooledDown) {
            try {
                translatedChunk = await translateChunkGoogle(chunk, targetLang);
                googleFailedAt = 0; // 成功则重置失败标记
            } catch (err) {
                console.warn('[Translate] Google translate unavailable, fallback to MyMemory:', err);
                googleFailedAt = Date.now();
            }
        }

        // 2. 若 Google 失败或处于熔断期，优先走国内直连主力源 (腾讯交互翻译 Tencent Transmart)
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
                translatedChunk = chunk; // 兜底保留原文，防止丢失内容
            }
        }

        fullTranslatedText += translatedChunk + '\n';
    }

    return fullTranslatedText.trimEnd();
}

function translateChunkGoogle(text: string, targetLang: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const url = `https://translate.googleapis.com/translate_a/single?client=dict-chrome-ex&sl=auto&tl=${encodeURIComponent(targetLang)}&dt=t`;
        const body = `q=${encodeURIComponent(text)}`;

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
            timeout: 6000,
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
                    if (translated && !translated.startsWith('MYMEMORY WARNING:')) {
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
            timeout: 3500,
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
