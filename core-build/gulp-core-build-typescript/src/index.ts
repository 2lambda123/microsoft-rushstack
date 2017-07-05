// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { TypeScriptTask } from './TypeScriptTask';
import { TSLintTask } from './TSLintTask';
import { TextTask } from './TextTask';
import { RemoveTripleSlashReferenceTask } from './RemoveTripleSlashReferenceTask';
import { IExecutable, parallel, serial } from '@microsoft/gulp-core-build';
import { ApiExtractorTask } from './ApiExtractorTask';
import { JsonSchemaToTsTask } from './JsonSchemaToTsTask';

export * from './TypeScriptConfiguration';
export { TypeScriptTask } from './TypeScriptTask';
export { ApiExtractorTask } from './ApiExtractorTask';

export const apiExtractor: ApiExtractorTask = new ApiExtractorTask();
export const typescript: TypeScriptTask = new TypeScriptTask();
export const tslint: TSLintTask = new TSLintTask();
export const text: TextTask = new TextTask();
export const removeTripleSlash: RemoveTripleSlashReferenceTask = new RemoveTripleSlashReferenceTask();
export const jsonSchemaToTs: JsonSchemaToTsTask = new JsonSchemaToTsTask();

// tslint:disable:export-name
export default parallel(tslint, serial(typescript, removeTripleSlash)) as IExecutable;
