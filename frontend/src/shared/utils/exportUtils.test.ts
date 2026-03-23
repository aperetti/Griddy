import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    convertToCsv,
    downloadFile,
    exportToCsv,
    exportToJson,
    copyToClipboard,
    getDataToCopy,
    autoExport
} from './exportUtils';

describe('exportUtils', () => {
    // Mock the document object if it doesn't exist (e.g., in a non-JSDOM environment)
    beforeEach(() => {
        if (typeof global.document === 'undefined') {
            global.document = {
                createElement: vi.fn(),
                execCommand: vi.fn(),
                body: {
                    appendChild: vi.fn(),
                    removeChild: vi.fn(),
                }
            } as any;
        }
        if (typeof global.URL === 'undefined') {
            global.URL = {
                createObjectURL: vi.fn(),
                revokeObjectURL: vi.fn()
            } as any;
        }
        if (typeof global.navigator === 'undefined') {
            global.navigator = {
                clipboard: {
                    writeText: vi.fn()
                }
            } as any;
        }
        if (typeof global.window === 'undefined') {
            global.window = {
                isSecureContext: true
            } as any;
        }
    });

    describe('convertToCsv', () => {
        it('returns empty string for empty data array', () => {
            expect(convertToCsv([])).toBe('');
        });

        it('converts simple objects to CSV', () => {
            const data = [
                { id: 1, name: 'Alice' },
                { id: 2, name: 'Bob' }
            ];
            const expected = `id,name\n1,Alice\n2,Bob`;
            expect(convertToCsv(data)).toBe(expected);
        });

        it('handles null and undefined values', () => {
            const data = [
                { id: 1, value: null },
                { id: 2, value: undefined },
                { id: 3, value: 'test' }
            ];
            const expected = `id,value\n1,\n2,\n3,test`;
            expect(convertToCsv(data)).toBe(expected);
        });

        it('escapes strings with commas', () => {
            const data = [{ id: 1, description: 'Hello, world' }];
            const expected = `id,description\n1,"Hello, world"`;
            expect(convertToCsv(data)).toBe(expected);
        });

        it('escapes strings with quotes', () => {
            const data = [{ id: 1, text: 'He said "Hello"' }];
            const expected = `id,text\n1,"He said ""Hello"""`;
            expect(convertToCsv(data)).toBe(expected);
        });

        it('escapes strings with newlines', () => {
            const data = [{ id: 1, multiline: 'Line 1\nLine 2' }];
            const expected = `id,multiline\n1,"Line 1\nLine 2"`;
            expect(convertToCsv(data)).toBe(expected);
        });
    });

    describe('downloadFile', () => {
        let originalCreateObjectURL: typeof URL.createObjectURL;
        let originalCreateElement: typeof document.createElement;
        let mockLink: any;

        beforeEach(() => {
            originalCreateObjectURL = URL.createObjectURL;
            originalCreateElement = document.createElement;

            URL.createObjectURL = vi.fn().mockReturnValue('blob:test-url');
            mockLink = {
                setAttribute: vi.fn(),
                style: { visibility: '' },
                click: vi.fn()
            };
            document.createElement = vi.fn().mockImplementation((tag) => {
                if (tag === 'a') return mockLink;
                return originalCreateElement.call(document, tag);
            });
            vi.spyOn(document.body, 'appendChild').mockImplementation(() => null as any);
            vi.spyOn(document.body, 'removeChild').mockImplementation(() => null as any);
        });

        afterEach(() => {
            URL.createObjectURL = originalCreateObjectURL;
            document.createElement = originalCreateElement;
            vi.restoreAllMocks();
        });

        it('creates a link and triggers download', () => {
            downloadFile('test content', 'test.txt', 'text/plain');

            expect(URL.createObjectURL).toHaveBeenCalled();
            expect(document.createElement).toHaveBeenCalledWith('a');
            expect(mockLink.setAttribute).toHaveBeenCalledWith('href', 'blob:test-url');
            expect(mockLink.setAttribute).toHaveBeenCalledWith('download', 'test.txt');
            expect(mockLink.style.visibility).toBe('hidden');
            expect(document.body.appendChild).toHaveBeenCalledWith(mockLink);
            expect(mockLink.click).toHaveBeenCalled();
            expect(document.body.removeChild).toHaveBeenCalledWith(mockLink);
        });
    });

    describe('exportToCsv', () => {
        let originalCreateObjectURL: typeof URL.createObjectURL;
        let originalCreateElement: typeof document.createElement;
        let mockLink: any;

        beforeEach(() => {
            originalCreateObjectURL = URL.createObjectURL;
            originalCreateElement = document.createElement;

            URL.createObjectURL = vi.fn().mockReturnValue('blob:test-url');
            mockLink = {
                setAttribute: vi.fn(),
                style: { visibility: '' },
                click: vi.fn()
            };
            document.createElement = vi.fn().mockImplementation((tag) => {
                if (tag === 'a') return mockLink;
                return originalCreateElement.call(document, tag);
            });
            vi.spyOn(document.body, 'appendChild').mockImplementation(() => null as any);
            vi.spyOn(document.body, 'removeChild').mockImplementation(() => null as any);
        });

        afterEach(() => {
            URL.createObjectURL = originalCreateObjectURL;
            document.createElement = originalCreateElement;
            vi.restoreAllMocks();
        });

        it('exports data to CSV and triggers download', () => {
            const data = [{ id: 1, name: 'Test' }];
            exportToCsv(data, 'testfile');

            expect(URL.createObjectURL).toHaveBeenCalled();
            expect(mockLink.setAttribute).toHaveBeenCalledWith('download', 'testfile.csv');
        });

        it('does not append .csv if already present', () => {
            const data = [{ id: 1, name: 'Test' }];
            exportToCsv(data, 'testfile.csv');

            expect(URL.createObjectURL).toHaveBeenCalled();
            expect(mockLink.setAttribute).toHaveBeenCalledWith('download', 'testfile.csv');
        });
    });

    describe('exportToJson', () => {
        let originalCreateObjectURL: typeof URL.createObjectURL;
        let originalCreateElement: typeof document.createElement;
        let mockLink: any;

        beforeEach(() => {
            originalCreateObjectURL = URL.createObjectURL;
            originalCreateElement = document.createElement;

            URL.createObjectURL = vi.fn().mockReturnValue('blob:test-url');
            mockLink = {
                setAttribute: vi.fn(),
                style: { visibility: '' },
                click: vi.fn()
            };
            document.createElement = vi.fn().mockImplementation((tag) => {
                if (tag === 'a') return mockLink;
                return originalCreateElement.call(document, tag);
            });
            vi.spyOn(document.body, 'appendChild').mockImplementation(() => null as any);
            vi.spyOn(document.body, 'removeChild').mockImplementation(() => null as any);
        });

        afterEach(() => {
            URL.createObjectURL = originalCreateObjectURL;
            document.createElement = originalCreateElement;
            vi.restoreAllMocks();
        });

        it('exports data to JSON and triggers download', () => {
            const data = { id: 1, name: 'Test' };
            exportToJson(data, 'testfile');

            expect(URL.createObjectURL).toHaveBeenCalled();
            expect(mockLink.setAttribute).toHaveBeenCalledWith('download', 'testfile.json');
        });

        it('does not append .json if already present', () => {
            const data = { id: 1, name: 'Test' };
            exportToJson(data, 'testfile.json');

            expect(URL.createObjectURL).toHaveBeenCalled();
            expect(mockLink.setAttribute).toHaveBeenCalledWith('download', 'testfile.json');
        });
    });

    describe('copyToClipboard', () => {
        let originalClipboard: any;
        let originalExecCommand: any;
        let originalCreateElement: any;

        beforeEach(() => {
            originalClipboard = navigator.clipboard;
            originalExecCommand = document.execCommand;
            originalCreateElement = document.createElement;
        });

        afterEach(() => {
            Object.defineProperty(navigator, 'clipboard', {
                value: originalClipboard,
                configurable: true
            });
            document.execCommand = originalExecCommand;
            document.createElement = originalCreateElement;
            vi.restoreAllMocks();
        });

        it('uses navigator.clipboard if available and in secure context', async () => {
            const writeTextMock = vi.fn().mockResolvedValue(undefined);
            Object.defineProperty(navigator, 'clipboard', {
                value: { writeText: writeTextMock },
                configurable: true
            });

            // Mock isSecureContext
            const originalIsSecureContext = window.isSecureContext;
            Object.defineProperty(window, 'isSecureContext', {
                value: true,
                configurable: true
            });

            const result = await copyToClipboard('test text');

            expect(writeTextMock).toHaveBeenCalledWith('test text');
            expect(result).toBe(true);

            Object.defineProperty(window, 'isSecureContext', {
                value: originalIsSecureContext,
                configurable: true
            });
        });

        it('falls back to legacy copy if navigator.clipboard fails', async () => {
            const writeTextMock = vi.fn().mockRejectedValue(new Error('Failed'));
            Object.defineProperty(navigator, 'clipboard', {
                value: { writeText: writeTextMock },
                configurable: true
            });

            const originalIsSecureContext = window.isSecureContext;
            Object.defineProperty(window, 'isSecureContext', {
                value: true,
                configurable: true
            });

            document.execCommand = vi.fn().mockReturnValue(true);

            const mockTextArea = {
                value: '',
                style: {},
                focus: vi.fn(),
                select: vi.fn()
            };
            document.createElement = vi.fn().mockImplementation((tag) => {
                if (tag === 'textarea') return mockTextArea;
                return originalCreateElement.call(document, tag);
            });

            vi.spyOn(document.body, 'appendChild').mockImplementation(() => null as any);
            vi.spyOn(document.body, 'removeChild').mockImplementation(() => null as any);

            const result = await copyToClipboard('test text');

            expect(writeTextMock).toHaveBeenCalledWith('test text');
            expect(document.execCommand).toHaveBeenCalledWith('copy');
            expect(result).toBe(true);

            Object.defineProperty(window, 'isSecureContext', {
                value: originalIsSecureContext,
                configurable: true
            });
        });

        it('falls back to legacy copy if navigator.clipboard is not available', async () => {
            Object.defineProperty(navigator, 'clipboard', {
                value: undefined,
                configurable: true
            });

            document.execCommand = vi.fn().mockReturnValue(true);

            const mockTextArea = {
                value: '',
                style: {},
                focus: vi.fn(),
                select: vi.fn()
            };
            document.createElement = vi.fn().mockImplementation((tag) => {
                if (tag === 'textarea') return mockTextArea;
                return originalCreateElement.call(document, tag);
            });

            vi.spyOn(document.body, 'appendChild').mockImplementation(() => null as any);
            vi.spyOn(document.body, 'removeChild').mockImplementation(() => null as any);

            const result = await copyToClipboard('test text');

            expect(document.execCommand).toHaveBeenCalledWith('copy');
            expect(result).toBe(true);
        });

        it('returns false if legacy copy fails', async () => {
            Object.defineProperty(navigator, 'clipboard', {
                value: undefined,
                configurable: true
            });

            document.execCommand = vi.fn().mockImplementation(() => {
                throw new Error('Copy blocked');
            });

            const mockTextArea = {
                value: '',
                style: {},
                focus: vi.fn(),
                select: vi.fn()
            };
            document.createElement = vi.fn().mockImplementation((tag) => {
                if (tag === 'textarea') return mockTextArea;
                return originalCreateElement.call(document, tag);
            });

            vi.spyOn(document.body, 'appendChild').mockImplementation(() => null as any);
            vi.spyOn(document.body, 'removeChild').mockImplementation(() => null as any);

            // Supress expected console.error
            vi.spyOn(console, 'error').mockImplementation(() => {});

            const result = await copyToClipboard('test text');

            expect(document.execCommand).toHaveBeenCalledWith('copy');
            expect(result).toBe(false);
        });
    });

    describe('getDataToCopy', () => {
        it('returns CSV string for tabular data', () => {
            const data = [{ id: 1, name: 'Alice' }];
            const result = getDataToCopy(data);
            expect(result).toBe(`id,name\n1,Alice`);
        });

        it('returns JSON string for non-tabular array data', () => {
            const data = [{ id: 1, nested: { value: 2 } }];
            const result = getDataToCopy(data);
            expect(result).toBe(JSON.stringify(data, null, 2));
        });

        it('returns JSON string for object data', () => {
            const data = { id: 1, name: 'Alice' };
            const result = getDataToCopy(data);
            expect(result).toBe(JSON.stringify(data, null, 2));
        });

        it('returns JSON string for primitive data', () => {
            const data = "hello";
            const result = getDataToCopy(data);
            expect(result).toBe(JSON.stringify(data, null, 2));
        });
    });

    describe('autoExport', () => {
        let originalCreateObjectURL: typeof URL.createObjectURL;
        let originalCreateElement: typeof document.createElement;
        let mockLink: any;

        beforeEach(() => {
            originalCreateObjectURL = URL.createObjectURL;
            originalCreateElement = document.createElement;

            URL.createObjectURL = vi.fn().mockReturnValue('blob:test-url');
            mockLink = {
                setAttribute: vi.fn(),
                style: { visibility: '' },
                click: vi.fn()
            };
            document.createElement = vi.fn().mockImplementation((tag) => {
                if (tag === 'a') return mockLink;
                return originalCreateElement.call(document, tag);
            });
            vi.spyOn(document.body, 'appendChild').mockImplementation(() => null as any);
            vi.spyOn(document.body, 'removeChild').mockImplementation(() => null as any);

            // Mock Date for predictable filenames
            vi.useFakeTimers();
            vi.setSystemTime(new Date('2023-01-01T12:00:00.000Z'));
        });

        afterEach(() => {
            URL.createObjectURL = originalCreateObjectURL;
            document.createElement = originalCreateElement;
            vi.restoreAllMocks();
            vi.useRealTimers();
        });

        it('exports to CSV for tabular data', () => {
            const data = [{ id: 1, name: 'Alice' }];
            autoExport(data, 'testfile');

            expect(URL.createObjectURL).toHaveBeenCalled();
            // Since it was tabular, it should call exportToCsv and add .csv
            expect(mockLink.setAttribute).toHaveBeenCalledWith('download', 'testfile_2023-01-01T12-00-00.csv');
        });

        it('exports to JSON for non-tabular array data', () => {
            const data = [{ id: 1, nested: { value: 2 } }];
            autoExport(data, 'testfile');

            expect(URL.createObjectURL).toHaveBeenCalled();
            // Since it was not tabular, it should call exportToJson and add .json
            expect(mockLink.setAttribute).toHaveBeenCalledWith('download', 'testfile_2023-01-01T12-00-00.json');
        });

        it('exports to JSON for object data', () => {
            const data = { id: 1, name: 'Alice' };
            autoExport(data, 'testfile');

            expect(URL.createObjectURL).toHaveBeenCalled();
            expect(mockLink.setAttribute).toHaveBeenCalledWith('download', 'testfile_2023-01-01T12-00-00.json');
        });
    });
});
