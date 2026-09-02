import * as https from 'https';

/**
 * Translates text using Google Translate's free API.
 * @param text The text to translate
 * @param targetLang The target language (default 'zh-CN')
 * @returns The translated text
 */
export async function translateText(text: string, targetLang: string = 'zh-CN'): Promise<string> {
    if (!text) return text;

    const maxLen = 2000;
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
                // If a single line is too long, chunk it by substring
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

    let fullTranslatedText = '';

    for (const chunk of chunks) {
        try {
            const translatedChunk = await translateChunk(chunk, targetLang);
            fullTranslatedText += translatedChunk;
        } catch (error) {
            console.error('Translation error for chunk:', error);
            // If translation fails, append the original chunk to avoid losing data
            fullTranslatedText += chunk + '\n';
        }
    }

    return fullTranslatedText;
}

function translateChunk(text: string, targetLang: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const url = `https://translate.googleapis.com/translate_a/single?client=dict-chrome-ex&sl=auto&tl=${targetLang}&dt=t`;
        
        // Use URL-encoded body
        const body = `q=${encodeURIComponent(text)}`;

        const options: https.RequestOptions = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Content-Length': Buffer.byteLength(body)
            }
        };

        const req = https.request(url, options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                if (res.statusCode !== 200) {
                    reject(new Error(`Translate API failed with status ${res.statusCode}: ${data}`));
                    return;
                }
                try {
                    const json = JSON.parse(data);
                    // The structure is usually [[[ "Translated 1", "Original 1", null, null, 10 ], [ "Translated 2", "Original 2" ... ]]]
                    let translated = '';
                    if (json && Array.isArray(json[0])) {
                        for (const item of json[0]) {
                            if (item && item[0]) {
                                translated += item[0];
                            }
                        }
                    } else {
                        reject(new Error('Unexpected response format'));
                        return;
                    }
                    resolve(translated);
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('error', (e) => {
            reject(e);
        });

        req.write(body);
        req.end();
    });
}
