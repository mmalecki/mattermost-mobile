// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useState} from 'react';
import {useIntl} from 'react-intl';
import {View} from 'react-native';
import {KeyboardAwareScrollView} from 'react-native-keyboard-controller';
import {SafeAreaView} from 'react-native-safe-area-context';

import {doPing} from '@actions/remote/general';
import {customHeadersErrorMessages, customHeadersMessages} from '@components/custom_headers_inputs';
import {Screens} from '@constants';
import DatabaseManager from '@database/manager';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import {getServerCredentials, setServerCredentials} from '@init/credentials';
import NetworkManager from '@managers/network_manager';
import {getServerByDisplayName} from '@queries/app/servers';
import Background from '@screens/background';
import {navigateBack} from '@screens/navigation';
import {areCustomHeadersEqual, parseCustomHeaders} from '@utils/custom_headers';
import {getErrorMessage} from '@utils/errors';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {getServerUrlAfterRedirect} from '@utils/url';

import Form from './form';
import Header from './header';

import type ServersModel from '@typings/database/models/app/servers';

type ServerProps = {
    server: ServersModel;
    theme: Theme;
}

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    appInfo: {
        color: changeOpacity(theme.centerChannelColor, 0.56),
    },
    flex: {
        flex: 1,
    },
    scrollContainer: {
        alignItems: 'center',
        flexGrow: 1,
        justifyContent: 'center',
    },
}));

const EditServer = ({server, theme}: ServerProps) => {
    const intl = useIntl();
    const {formatMessage} = intl;
    const [saving, setSaving] = useState(false);
    const [displayName, setDisplayName] = useState<string>(server.displayName);
    const [buttonDisabled, setButtonDisabled] = useState(Boolean(!server.displayName));
    const [displayNameError, setDisplayNameError] = useState<string | undefined>();
    const [preauthSecret, setPreauthSecret] = useState<string>('');
    const [initialPreauthSecret, setInitialPreauthSecret] = useState<string>('');
    const [preauthSecretError, setPreauthSecretError] = useState<string | undefined>();
    const [customHeadersEnabled, setCustomHeadersEnabled] = useState<boolean>(false);
    const [customHeaders, setCustomHeaders] = useState<CustomHeader[]>([]);
    const [initialCustomHeaders, setInitialCustomHeaders] = useState<CustomHeader[] | undefined>();
    const [customHeadersError, setCustomHeadersError] = useState<string | undefined>();
    const [showAdvancedOptions, setShowAdvancedOptions] = useState<boolean>(false);
    const [validating, setValidating] = useState(false);
    const styles = getStyleSheet(theme);

    const close = useCallback(() => {
        navigateBack();
    }, []);

    // Load current preauth secret and custom headers from credentials
    useEffect(() => {
        const loadCredentials = async () => {
            try {
                const credentials = await getServerCredentials(server.url);
                const currentPreauthSecret = credentials?.preauthSecret || '';
                setPreauthSecret(currentPreauthSecret);
                setInitialPreauthSecret(currentPreauthSecret);
                setCustomHeadersEnabled(Boolean(credentials?.customHeaders?.length));
                setCustomHeaders(credentials?.customHeaders ?? []);
                setInitialCustomHeaders(credentials?.customHeaders);

                // Auto-open advanced options if preauth secret or custom headers exist
                if (currentPreauthSecret || credentials?.customHeaders?.length) {
                    setShowAdvancedOptions(true);
                }
            } catch (error) {
                // Credentials not found or error loading, keep empty
            }
        };

        loadCredentials();
    }, [server.url]);

    useEffect(() => {
        setButtonDisabled(Boolean(!displayName));
    }, [displayName]);

    // Validate server connection with preauth secret and custom headers
    const validateServer = useCallback(async (headersToSend?: CustomHeader[]): Promise<boolean> => {
        setValidating(true);

        try {
            const trimmedSecret = preauthSecret.trim();

            // Test with the actual preauth secret value (or undefined if empty)
            const secretForValidation = trimmedSecret || undefined;

            // First try HEAD request
            const headRequest = await getServerUrlAfterRedirect(server.url, true, secretForValidation, headersToSend);
            if (headRequest.isCloudflareAccessError) {
                setCustomHeadersError(formatMessage(headersToSend?.length ? customHeadersMessages.cloudflareAccessRejected : customHeadersMessages.cloudflareAccessRequired));
                setShowAdvancedOptions(true);
                return false;
            }
            if (!headRequest.url) {
                setPreauthSecretError(getErrorMessage(headRequest.error, intl));
                setShowAdvancedOptions(true);
                return false;
            }

            // Then try ping request - use doPing without client to avoid client pollution
            const result = await doPing(
                headRequest.url, // serverUrl
                true, // verifyPushProxy
                undefined, // timeoutInterval
                secretForValidation, // preauthSecret
                headersToSend, // customHeaders
            );
            if (result.error) {
                if (result.isPreauthError) {
                    setPreauthSecretError(formatMessage({
                        id: 'mobile.server.preauth_secret.invalid',
                        defaultMessage: 'Authentication secret is invalid. Try again or contact your admin.',
                    }));
                    setShowAdvancedOptions(true);
                } else {
                    setPreauthSecretError(getErrorMessage(result.error, intl));
                    setShowAdvancedOptions(true);
                }
                return false;
            }

            return true;
        } catch (error) {
            // Handle any unexpected errors during validation
            setPreauthSecretError(formatMessage({
                id: 'mobile.server.validation.error',
                defaultMessage: 'Unable to validate server. Please try again.',
            }));
            setShowAdvancedOptions(true);
            return false;
        } finally {
            setValidating(false);
        }
    }, [server.url, preauthSecret, formatMessage, intl]);

    const handleUpdate = useCallback(async () => {
        if (buttonDisabled) {
            return;
        }

        if (displayNameError) {
            setDisplayNameError(undefined);
        }

        if (preauthSecretError) {
            setPreauthSecretError(undefined);
        }

        const parsedCustomHeaders = customHeadersEnabled ? parseCustomHeaders(customHeaders) : {headers: []};
        if (parsedCustomHeaders.error) {
            setCustomHeadersError(formatMessage(customHeadersErrorMessages[parsedCustomHeaders.error]));
            setShowAdvancedOptions(true);
            return;
        }
        const headersToSend = parsedCustomHeaders.headers.length ? parsedCustomHeaders.headers : undefined;

        setSaving(true);

        // Check display name uniqueness
        const knownServer = await getServerByDisplayName(displayName);
        if (knownServer && knownServer.lastActiveAt > 0 && knownServer.url !== server.url) {
            setButtonDisabled(true);
            setDisplayNameError(formatMessage({
                id: 'mobile.server_name.exists',
                defaultMessage: 'You are using this name for another server.',
            }));
            setSaving(false);
            return;
        }

        // Only validate server connection if preauth secret or custom headers have changed
        const preauthSecretChanged = preauthSecret.trim() !== initialPreauthSecret.trim();
        const customHeadersChanged = !areCustomHeadersEqual(headersToSend, initialCustomHeaders);
        if (preauthSecretChanged || customHeadersChanged) {
            const isValidServer = await validateServer(headersToSend);
            if (!isValidServer) {
                setSaving(false);
                return;
            }
        }

        // Save display name
        await DatabaseManager.updateServerDisplayName(server.url, displayName);

        // Save preauth secret and custom headers to credentials (or remove if empty)
        const credentials = await getServerCredentials(server.url);
        setServerCredentials(server.url, credentials?.token || '', preauthSecret.trim() || undefined, headersToSend);

        // Create and cache new client if preauth secret or custom headers changed
        try {
            await NetworkManager.createClient(server.url, credentials?.token, preauthSecret.trim() || undefined, headersToSend);
        } catch (error) {
            // Client creation failed, but credentials are saved - continue with modal dismissal
        }

        navigateBack();
    }, [buttonDisabled, displayName, displayNameError, preauthSecretError, customHeadersEnabled, customHeaders, server.url, preauthSecret, initialPreauthSecret, initialCustomHeaders, formatMessage, validateServer]);

    const handleDisplayNameTextChanged = useCallback((text: string) => {
        setDisplayName(text);
        setDisplayNameError(undefined);
    }, []);

    const handlePreauthSecretTextChanged = useCallback((text: string) => {
        setPreauthSecret(text);
        setPreauthSecretError(undefined);
    }, []);

    const handleCustomHeadersEnabledChange = useCallback((enabled: boolean) => {
        setCustomHeadersEnabled(enabled);
        setCustomHeadersError(undefined);
    }, []);

    const handleCustomHeadersChange = useCallback((headers: CustomHeader[]) => {
        setCustomHeaders(headers);
        setCustomHeadersError(undefined);
    }, []);

    useAndroidHardwareBackHandler(Screens.EDIT_SERVER, close);

    return (
        <View style={styles.flex}>
            <Background theme={theme}/>
            <SafeAreaView
                key={'server_content'}
                style={styles.flex}
                testID='edit_server.screen'
            >
                <KeyboardAwareScrollView
                    bounces={false}
                    contentContainerStyle={styles.scrollContainer}
                    keyboardDismissMode='on-drag'
                    keyboardShouldPersistTaps='handled'
                    scrollToOverflowEnabled={true}
                    style={styles.flex}
                    mode='layout'
                >
                    <Header theme={theme}/>
                    <Form
                        buttonDisabled={buttonDisabled}
                        connecting={saving || validating}
                        customHeaders={customHeaders}
                        customHeadersEnabled={customHeadersEnabled}
                        customHeadersError={customHeadersError}
                        displayName={displayName}
                        displayNameError={displayNameError}
                        handleCustomHeadersChange={handleCustomHeadersChange}
                        handleCustomHeadersEnabledChange={handleCustomHeadersEnabledChange}
                        handleUpdate={handleUpdate}
                        handleDisplayNameTextChanged={handleDisplayNameTextChanged}
                        handlePreauthSecretTextChanged={handlePreauthSecretTextChanged}
                        preauthSecret={preauthSecret}
                        preauthSecretError={preauthSecretError}
                        serverUrl={server.url}
                        setShowAdvancedOptions={setShowAdvancedOptions}
                        showAdvancedOptions={showAdvancedOptions}
                        theme={theme}
                    />
                </KeyboardAwareScrollView>
            </SafeAreaView>
        </View>
    );
};

export default EditServer;
