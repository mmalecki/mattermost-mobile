// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useRef} from 'react';
import {defineMessages, useIntl} from 'react-intl';
import {Pressable, Text, View} from 'react-native';

import Button from '@components/button';
import CompassIcon from '@components/compass_icon';
import FloatingTextInput from '@components/floating_input/floating_text_input_label';
import FormattedText from '@components/formatted_text';
import OptionItem from '@components/option_item';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {CustomHeadersError} from '@utils/custom_headers';

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        marginTop: 16,
        width: '100%',
    },
    help: {
        color: changeOpacity(theme.centerChannelColor, 0.64),
        ...typography('Body', 75, 'Regular'),
    },
    headers: {
        gap: 24,
        marginTop: 24,
    },
    row: {
        alignItems: 'center',
        flexDirection: 'row',
        gap: 8,
    },
    rowInputs: {
        flex: 1,
        gap: 16,
    },
    removePressed: {
        opacity: 0.72,
    },
    addButton: {
        alignSelf: 'flex-start',
        marginTop: 16,
    },
    error: {
        color: theme.errorTextColor,
        marginTop: 8,
        ...typography('Body', 75, 'Regular'),
    },
}));

export const customHeadersMessages = defineMessages({
    toggle: {
        id: 'mobile.components.select_server_view.customHeaders',
        defaultMessage: 'Custom headers',
    },
    help: {
        id: 'mobile.components.select_server_view.customHeadersHelp',
        defaultMessage: 'Sent with every request, for example to get through an access gateway',
    },
    name: {
        id: 'mobile.components.select_server_view.customHeaderName',
        defaultMessage: 'Header name',
    },
    value: {
        id: 'mobile.components.select_server_view.customHeaderValue',
        defaultMessage: 'Header value',
    },
    add: {
        id: 'mobile.components.select_server_view.addCustomHeader',
        defaultMessage: 'Add header',
    },
    remove: {
        id: 'mobile.components.select_server_view.removeCustomHeader',
        defaultMessage: 'Remove header',
    },
    cloudflareAccessRejected: {
        id: 'mobile.server.custom_headers.cloudflare_access_rejected',
        defaultMessage: 'Cloudflare Access did not accept the custom headers. Check them or contact your admin.',
    },
    cloudflareAccessRequired: {
        id: 'mobile.server.custom_headers.cloudflare_access_required',
        defaultMessage: 'This server is protected by Cloudflare Access. Add its service token as custom headers to connect.',
    },
});

export const customHeadersErrorMessages = defineMessages<CustomHeadersError>({
    incomplete: {
        id: 'mobile.server.custom_headers.incomplete',
        defaultMessage: 'Enter both a name and a value for each header.',
    },
    invalid_name: {
        id: 'mobile.server.custom_headers.invalid_name',
        defaultMessage: 'Header names can only contain letters, numbers and symbols such as - or _.',
    },
    invalid_value: {
        id: 'mobile.server.custom_headers.invalid_value',
        defaultMessage: 'Header values cannot contain line breaks.',
    },
    reserved: {
        id: 'mobile.server.custom_headers.reserved',
        defaultMessage: 'One of these headers is set by the app and cannot be overridden.',
    },
    duplicate: {
        id: 'mobile.server.custom_headers.duplicate',
        defaultMessage: 'Each header name can only be used once.',
    },
});

const EMPTY_HEADER: CustomHeader = {name: '', value: ''};

type RowProps = {
    header: CustomHeader;
    index: number;
    onChange: (index: number, header: CustomHeader) => void;
    onRemove: (index: number) => void;
    testID: string;
    theme: Theme;
};

const CustomHeaderRow = ({header, index, onChange, onRemove, testID, theme}: RowProps) => {
    const {formatMessage} = useIntl();
    const styles = getStyleSheet(theme);

    const onNameChange = useCallback((name: string) => {
        onChange(index, {...header, name});
    }, [header, index, onChange]);

    const onValueChange = useCallback((value: string) => {
        onChange(index, {...header, value});
    }, [header, index, onChange]);

    const onRemovePress = useCallback(() => {
        onRemove(index);
    }, [index, onRemove]);

    return (
        <View style={styles.row}>
            <View style={styles.rowInputs}>
                <FloatingTextInput
                    rawInput={true}
                    label={formatMessage(customHeadersMessages.name)}
                    onChangeText={onNameChange}
                    returnKeyType='next'
                    testID={`${testID}.${index}.name.input`}
                    theme={theme}
                    value={header.name}
                />
                <FloatingTextInput
                    rawInput={true}
                    label={formatMessage(customHeadersMessages.value)}
                    onChangeText={onValueChange}
                    returnKeyType='done'
                    secureTextEntry={true}
                    testID={`${testID}.${index}.value.input`}
                    theme={theme}
                    value={header.value}
                />
            </View>
            <Pressable
                accessibilityLabel={formatMessage(customHeadersMessages.remove)}
                accessibilityRole='button'
                hitSlop={8}
                onPress={onRemovePress}
                style={({pressed}) => pressed && styles.removePressed}
                testID={`${testID}.${index}.remove.button`}
            >
                <CompassIcon
                    color={changeOpacity(theme.centerChannelColor, 0.64)}
                    name='trash-can-outline'
                    size={24}
                />
            </Pressable>
        </View>
    );
};

type Props = {
    enabled: boolean;
    error?: string;
    headers: CustomHeader[];
    onEnabledChange: (enabled: boolean) => void;
    onHeadersChange: (headers: CustomHeader[]) => void;
    testID: string;
    theme: Theme;
};

const CustomHeadersInputs = ({
    enabled,
    error,
    headers,
    onEnabledChange,
    onHeadersChange,
    testID,
    theme,
}: Props) => {
    const {formatMessage} = useIntl();
    const styles = getStyleSheet(theme);

    // Stable keys for the rows, so removing one does not hand its inputs to the next row
    const rowKeys = useRef<number[]>([]);
    const nextRowKey = useRef(0);
    while (rowKeys.current.length < headers.length) {
        rowKeys.current.push(nextRowKey.current++);
    }
    rowKeys.current.length = headers.length;

    const onToggle = useCallback((value: string | boolean) => {
        const isEnabled = Boolean(value);
        if (isEnabled && !headers.length) {
            onHeadersChange([EMPTY_HEADER]);
        }
        onEnabledChange(isEnabled);
    }, [headers.length, onEnabledChange, onHeadersChange]);

    const onRowChange = useCallback((index: number, header: CustomHeader) => {
        onHeadersChange(headers.map((h, i) => (i === index ? header : h)));
    }, [headers, onHeadersChange]);

    const onRowRemove = useCallback((index: number) => {
        rowKeys.current.splice(index, 1);
        const remaining = headers.filter((_, i) => i !== index);
        onHeadersChange(remaining);
        if (!remaining.length) {
            onEnabledChange(false);
        }
    }, [headers, onEnabledChange, onHeadersChange]);

    const onAdd = useCallback(() => {
        onHeadersChange([...headers, EMPTY_HEADER]);
    }, [headers, onHeadersChange]);

    return (
        <View style={styles.container}>
            <OptionItem
                action={onToggle}
                label={formatMessage(customHeadersMessages.toggle)}
                selected={enabled}
                testID={`${testID}.toggle`}
                type='toggle'
            />
            <FormattedText
                {...customHeadersMessages.help}
                style={styles.help}
                testID={`${testID}.help`}
            />
            {enabled && (
                <>
                    <View style={styles.headers}>
                        {headers.map((header, index) => (
                            <CustomHeaderRow
                                key={rowKeys.current[index]}
                                header={header}
                                index={index}
                                onChange={onRowChange}
                                onRemove={onRowRemove}
                                testID={testID}
                                theme={theme}
                            />
                        ))}
                    </View>
                    <View style={styles.addButton}>
                        <Button
                            emphasis='tertiary'
                            iconName='plus'
                            onPress={onAdd}
                            size='s'
                            testID={`${testID}.add.button`}
                            text={formatMessage(customHeadersMessages.add)}
                            theme={theme}
                        />
                    </View>
                </>
            )}
            {Boolean(error) && (
                <Text
                    style={styles.error}
                    testID={`${testID}.error`}
                >
                    {error}
                </Text>
            )}
        </View>
    );
};

export default CustomHeadersInputs;
