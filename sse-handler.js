import pako from 'pako';
import clc from 'cli-color';

// ============================================================================
// URL Parameter Helpers
// ============================================================================

/**
 * Добавляет параметр accept-b64-gzip=true к URL если его еще нет
 * @param {string} url - исходный URL
 * @returns {string} - URL с добавленным параметром
 */
export function appendB64GzipParam(url) {
    if (url.indexOf("accept-b64-gzip=") > -1) {
        return url;
    }
    if (url.indexOf("?") > -1) {
        return url + "&accept-b64-gzip=true";
    }
    return url + "?accept-b64-gzip=true";
}

/**
 * Добавляет параметр accept-sse-chunks=true к URL если его еще нет
 * Используется только для SSE соединений
 * @param {string} url - исходный URL
 * @returns {string} - URL с добавленным параметром
 */
export function appendChunksParam(url) {
    if (url.indexOf("accept-sse-chunks=") > -1) {
        return url;
    }
    if (url.indexOf("?") > -1) {
        return url + "&accept-sse-chunks=true";
    }
    return url + "?accept-sse-chunks=true";
}

// ============================================================================
// BASE64/GZIP Decoding
// ============================================================================

/**
 * Декодирует данные с префиксом BASE64/GZIP:
 * @param {string} data - данные (может быть с префиксом BASE64/GZIP: или обычный JSON)
 * @returns {{data: string, isCompressed: boolean}} - декодированная строка и флаг сжатия
 */
export function decodeB64GzipData(data) {
    const PREFIX = "BASE64/GZIP:";
    const PREFIX_LENGTH = 12;
    
    // Проверка префикса
    if (data.substring(0, PREFIX_LENGTH) !== PREFIX) {
        return { data, isCompressed: false }; // Обычные данные, возвращаем как есть
    }
    
    try {
        // Извлекаем base64 строку после префикса
        const base64Str = data.substring(PREFIX_LENGTH);
        
        // Декодируем base64 в бинарные данные (Node.js)
        const binaryData = Buffer.from(base64Str, 'base64');
        
        // Преобразуем Buffer в массив чисел для pako
        const gzipData = Array.from(binaryData);
        
        // Распаковываем gzip
        const plain = pako.ungzip(gzipData, { to: 'string' });
        
        return { data: plain, isCompressed: true }; // Возвращаем распакованную строку (JSON)
    } catch (err) {
        console.error(clc.red('Failed to decode BASE64/GZIP data:'), err.message);
        throw new Error("Invalid BASE64/GZIP data");
    }
}

// ============================================================================
// SSE Chunk Assembly
// ============================================================================

/**
 * Создает обработчик для сборки чанков SSE
 * @param {function} onComplete - callback вызываемый когда все чанки собраны
 * @returns {function} - функция-обработчик чанков
 */
export function createChunkAssembler(onComplete) {
    const buffers = {};
    
    return (rawData) => {
        // Парсим JSON чанка
        let chunk;
        try {
            chunk = JSON.parse(rawData);
        } catch (err) {
            console.error(clc.red('Failed to parse chunk JSON:'), err.message);
            return;
        }
        
        // Проверяем обязательные поля
        if (!chunk || !chunk.chunkId) {
            console.error(clc.red('Chunk missing chunkId:'), rawData.substring(0, 200));
            return;
        }
        
        const id = chunk.chunkId;
        
        // Находим или создаем буфер
        let buffer = buffers[id];
        if (!buffer) {
            buffer = {
                total: chunk.total || 0,
                received: 0,
                parts: []
            };
            buffers[id] = buffer;
            console.log(clc.cyan(`[Chunk] Start id=${id} total=${buffer.total}`));
        }
        
        // Обновляем total если пришел
        if (chunk.total && !buffer.total) {
            buffer.total = chunk.total;
        }
        
        // Получаем индекс
        const index = typeof chunk.index === "number" ? chunk.index : 0;
        
        // Сохраняем часть если еще не сохранена
        if (typeof buffer.parts[index] === "undefined") {
            buffer.received++;
        }
        
        // Декодируем payload из base64
        try {
            const payload = chunk.payload || "";
            buffer.parts[index] = Buffer.from(payload, 'base64').toString('binary');
        } catch (err) {
            console.error(clc.red(`[Chunk] Failed to decode payload for id=${id} index=${index}:`), err.message);
            return;
        }
        
        console.log(clc.cyan(`[Chunk] Received id=${id} part=${index + 1}/${buffer.total} received=${buffer.received}`));
        
        // Проверяем, все ли чанки получены
        if (buffer.total > 0 && buffer.received >= buffer.total) {
            // Проверяем, что все индексы заполнены
            let complete = true;
            for (let i = 0; i < buffer.total; i++) {
                if (typeof buffer.parts[i] === "undefined") {
                    complete = false;
                    break;
                }
            }
            
            if (!complete) {
                console.error(clc.red(`[Chunk] Sequence incomplete for id=${id}`));
                return;
            }
            
            // Объединяем части
            const mergedBinary = buffer.parts.join('');
            console.log(clc.green(`[Chunk] Complete id=${id} mergedSize=${mergedBinary.length}`));
            
            // Преобразуем бинарную строку в UTF-8
            let merged;
            try {
                // В Node.js используем Buffer для преобразования binary в UTF-8
                merged = Buffer.from(mergedBinary, 'binary').toString('utf8');
            } catch (err) {
                console.error(clc.red(`[Chunk] Failed to convert binary to UTF-8 for id=${id}:`), err.message);
                delete buffers[id];
                return;
            }
            
            // Удаляем буфер и вызываем callback
            delete buffers[id];
            onComplete(merged);
        }
    };
}

