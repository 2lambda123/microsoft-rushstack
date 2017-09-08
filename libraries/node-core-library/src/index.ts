// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Core libraries that every NodeJS toolchain project should use.
 */
declare const packageDescription: void; // tslint:disable-line:no-unused-variable

export { FileDiffTest } from './FileDiffTest';
export {
  JsonFile,
  IJsonFileSaveOptions,
  IJsonFileStringifyOptions
} from './JsonFile';
export {
  JsonSchema,
  IJsonSchemaErrorInfo,
  IJsonSchemaValidateOptions,
  IJsonSchemaFromFileOptions
} from './JsonSchema';
export { PackageJsonLookup } from './PackageJsonLookup';
