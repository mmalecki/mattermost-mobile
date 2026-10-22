// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

type CustomHeader = {
    name: string;
    value: string;
};

type ServerCredential = {
    serverUrl: string;
    userId: string;
    token: string;
    preauthSecret?: string;
    customHeaders?: CustomHeader[];
};
