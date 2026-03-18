/**
 * Utilities for exporting data from the browser to various formats.
 */

/**
 * Escapes a string for CSV format.
 */
function escapeCsvValue(val: any): string {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

/**
 * Converts an array of objects to a CSV string.
 */
export function convertToCsv(data: any[]): string {
    if (data.length === 0) return '';
    
    const headers = Object.keys(data[0]);
    const csvRows = [];
    
    // Add headers
    csvRows.push(headers.join(','));
    
    // Add data rows
    for (const row of data) {
        const values = headers.map(header => escapeCsvValue(row[header]));
        csvRows.push(values.join(','));
    }
    
    return csvRows.join('\n');
}

/**
 * Generic function to trigger a browser download.
 */
export function downloadFile(content: string, filename: string, mimeType: string) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/**
 * Exports data to CSV and triggers download.
 */
export function exportToCsv(data: any[], filename: string) {
    const csvContent = convertToCsv(data);
    downloadFile(csvContent, filename.endsWith('.csv') ? filename : `${filename}.csv`, 'text/csv;charset=utf-8;');
}

/**
 * Exports data to JSON and triggers download.
 */
export function exportToJson(data: any, filename: string) {
    const jsonContent = JSON.stringify(data, null, 2);
    downloadFile(jsonContent, filename.endsWith('.json') ? filename : `${filename}.json`, 'application/json;charset=utf-8;');
}

/**
 * Copies text to the clipboard with a fallback for older browsers or non-secure contexts.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
    // 1. Try modern API first (requires secure context)
    if (navigator.clipboard && window.isSecureContext) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            console.error('Modern clipboard API failed, trying fallback:', err);
        }
    }

    // 2. Legacy fallback using document.execCommand('copy')
    try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        
        // Ensure it's not visible and doesn't scroll the page
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        textArea.style.top = '0';
        textArea.style.opacity = '0';
        
        document.body.appendChild(textArea);
        
        // Handle iOS: need to prevent zooming and ensure selection works
        textArea.contentEditable = 'true';
        textArea.readOnly = false;
        
        const range = document.createRange();
        range.selectNodeContents(textArea);
        
        const selection = window.getSelection();
        if (selection) {
            selection.removeAllRanges();
            selection.addRange(range);
            textArea.setSelectionRange(0, 999999);
        }

        const success = document.execCommand('copy');
        document.body.removeChild(textArea);
        
        return success;
    } catch (err) {
        console.error('Clipboard fallback failed:', err);
        return false;
    }
}

/**
 * Heuristically determines the string content to copy (JSON or CSV).
 */
export function getDataToCopy(data: any): string {
    if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' && data[0] !== null) {
        const firstEntry = data[0];
        const isTabular = Object.values(firstEntry).every(v => v === null || typeof v !== 'object');
        
        if (isTabular) {
            return convertToCsv(data);
        }
    }
    
    return JSON.stringify(data, null, 2);
}

/**
 * Heuristically determines if data is tabular and performs the appropriate export.
 */
export function autoExport(data: any, baseFilename: string) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `${baseFilename}_${timestamp}`;

    if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' && data[0] !== null) {
        // Check if it's "flat" enough for CSV
        // We'll consider it tabular if most values in the first object are primitive
        const firstEntry = data[0];
        const isTabular = Object.values(firstEntry).every(v => v === null || typeof v !== 'object');
        
        if (isTabular) {
            exportToCsv(data, filename);
            return;
        }
    }
    
    exportToJson(data, filename);
}
