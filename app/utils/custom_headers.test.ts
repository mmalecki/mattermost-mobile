// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {areCustomHeadersEqual, getCustomHeadersRecord, parseCustomHeaders} from './custom_headers';

describe('parseCustomHeaders', () => {
    it('should return trimmed headers and skip empty rows', () => {
        const result = parseCustomHeaders([
            {name: ' CF-Access-Client-Id ', value: ' id.access '},
            {name: '', value: '  '},
            {name: 'X-Gateway-Token', value: 'abc def'},
        ]);

        expect(result.error).toBeUndefined();
        expect(result.headers).toHaveLength(2);
        expect(result.headers).toEqual([
            {name: 'CF-Access-Client-Id', value: 'id.access'},
            {name: 'X-Gateway-Token', value: 'abc def'},
        ]);
    });

    it('should reject a row with only a name or only a value', () => {
        expect(parseCustomHeaders([{name: 'X-Gateway-Token', value: ''}])).toEqual({error: 'incomplete'});
        expect(parseCustomHeaders([{name: ' ', value: 'secret'}])).toEqual({error: 'incomplete'});
    });

    it('should reject names that are not valid header names', () => {
        expect(parseCustomHeaders([{name: 'X Gateway', value: 'secret'}])).toEqual({error: 'invalid_name'});
        expect(parseCustomHeaders([{name: 'X-Gateway:', value: 'secret'}])).toEqual({error: 'invalid_name'});
    });

    it('should reject values with line breaks', () => {
        expect(parseCustomHeaders([{name: 'X-Gateway', value: 'secret\r\nX-Injected: 1'}])).toEqual({error: 'invalid_value'});
    });

    it('should reject headers the app sets itself, regardless of case', () => {
        expect(parseCustomHeaders([{name: 'authorization', value: 'Basic abc'}])).toEqual({error: 'reserved'});
        expect(parseCustomHeaders([{name: 'X-Mattermost-Preauth-Secret', value: 'secret'}])).toEqual({error: 'reserved'});
    });

    it('should reject the same name used twice, regardless of case', () => {
        expect(parseCustomHeaders([
            {name: 'X-Gateway', value: 'one'},
            {name: 'x-gateway', value: 'two'},
        ])).toEqual({error: 'duplicate'});
    });
});

describe('getCustomHeadersRecord', () => {
    it('should map the headers by name', () => {
        expect(getCustomHeadersRecord([
            {name: 'CF-Access-Client-Id', value: 'id.access'},
            {name: 'CF-Access-Client-Secret', value: 'secret'},
        ])).toEqual({
            'CF-Access-Client-Id': 'id.access',
            'CF-Access-Client-Secret': 'secret',
        });
    });

    it('should return no headers when there are none', () => {
        expect(getCustomHeadersRecord(undefined)).toEqual({});
    });
});

describe('areCustomHeadersEqual', () => {
    it('should compare names, values and order', () => {
        const headers = [{name: 'A', value: '1'}, {name: 'B', value: '2'}];

        expect(areCustomHeadersEqual(headers, [{name: 'A', value: '1'}, {name: 'B', value: '2'}])).toBe(true);
        expect(areCustomHeadersEqual(headers, [{name: 'A', value: '1'}, {name: 'B', value: '3'}])).toBe(false);
        expect(areCustomHeadersEqual(headers, [{name: 'A', value: '1'}])).toBe(false);
        expect(areCustomHeadersEqual(undefined, [])).toBe(true);
    });
});
