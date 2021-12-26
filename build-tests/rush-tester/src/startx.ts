// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Rush } from '@microsoft/rush-lib/lib/api/Rush';

Rush.launchRushX(Rush.version, { isManaged: false, builtInPluginsProjectPath: `${__dirname}/..` });
