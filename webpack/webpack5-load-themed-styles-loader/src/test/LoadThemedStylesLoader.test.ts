// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as loader from '..';
import type { Stats } from 'webpack';
import LoadThemedStylesMock = require('./testData/LoadThemedStylesMock');
import getCompiler from './testData/getCompiler';
import { Path } from '@rushstack/node-core-library';

const MATCH_GENERATED_LOADER_STRING_REGEXP: RegExp = /var\sloader\s\=\srequire\(["'](.+?)["']\)/;
const MATCH_LOADER_DOT_LOADSTYLES_FUNCTION_ASYNC_VALUE_REGEXP: RegExp = /loader\.loadStyles\(.+?,\s(.+?)\)/;

function getLoadThemedStylesLibPath(stats: Stats): string {
  // Example:
  //   var loader = require("C:\\Git\\rushstack\\libraries\\load-themed-styles\\lib\\index.js");
  const content: string = stats.toJson({ source: true }).modules?.[0].source?.toString() ?? '';
  const match: RegExpExecArray | null = MATCH_GENERATED_LOADER_STRING_REGEXP.exec(content);
  // Example:
  //   C:\\Git\\rushstack\\libraries\\load-themed-styles\\lib\\index.js
  const escapedPath: string = match?.[1] ?? '';
  // Example:
  //   C:\Git\rushstack\libraries\load-themed-styles\lib\index.js
  const loadThemedStylesLibPath: string = JSON.parse(`"${escapedPath}"`);
  return loadThemedStylesLibPath;
}

describe('webpack5-load-themed-style-loader', () => {
  beforeEach(() => {
    LoadThemedStylesMock.loadedData = [];
    LoadThemedStylesMock.calledWithAsync = [];
  });

  it('follows the Webpack loader interface', () => {
    expect(loader.pitch).toBeDefined();
  });

  it('it inserts the resolved load-themed-styles path', async () => {
    const stats: Stats | undefined = await getCompiler('./MockStyle1.css');
    if (stats !== undefined) {
      const expectedPath: string = require.resolve('@microsoft/load-themed-styles');
      const loadThemedStylesLibPath: string = getLoadThemedStylesLibPath(stats);
      expect(Path.isEqual(loadThemedStylesLibPath, expectedPath)).toBe(true);
    }
  });

  it('it allows for and inserts override of load-themed-styles path', async () => {
    // It would error when I attempt to use the .ts mock in src/test/testData
    // beacuse I'm not setting up default support for webpack to load .ts files.
    const expectedPath: string = '../../../lib/test/testData/LoadThemedStylesMock';
    const stats = await getCompiler('./MockStyle1.css', { loadThemedStylesPath: expectedPath });
    if (stats !== undefined) {
      const loadThemedStylesLibPath: string = getLoadThemedStylesLibPath(stats);
      expect(Path.isEqual(loadThemedStylesLibPath, expectedPath)).toBe(true);
    }
  });

  it('correctly handles the async option set to "false"', async () => {
    const stats = await getCompiler('./MockStyle1.css', { async: false });
    if (stats !== undefined) {
      const content = stats.toJson({ source: true }).modules?.[0].source;
      const match = MATCH_LOADER_DOT_LOADSTYLES_FUNCTION_ASYNC_VALUE_REGEXP.exec(content as string);
      const asyncValue = match?.[1];

      expect(asyncValue).toEqual('false');
    }
  });

  it('correctly handles and detects the async option not being set', async () => {
    const stats = await getCompiler('./MockStyle1.css');
    if (stats !== undefined) {
      const content = stats.toJson({ source: true }).modules?.[0].source;
      const match = MATCH_LOADER_DOT_LOADSTYLES_FUNCTION_ASYNC_VALUE_REGEXP.exec(content as string);
      const asyncValue = match?.[1];

      expect(asyncValue).toEqual('false');
    }
  });

  it('correctly handles the async option set to "true"', async () => {
    const stats = await getCompiler('./MockStyle1.css', { async: true });
    if (stats !== undefined) {
      const content = stats.toJson({ source: true }).modules?.[0].source;
      const match = MATCH_LOADER_DOT_LOADSTYLES_FUNCTION_ASYNC_VALUE_REGEXP.exec(content as string);
      const asyncValue = match?.[1];

      expect(asyncValue).toEqual('true');
    }
  });

  it('generates desired output for esModule option set to "true" as a snapshot', async () => {
    // We mock the path of the loader because the full resolved path can change between machines
    // IE: Different folder topology, etc. So we just used the mocked module and set it
    // to loadThemedStylesPath option from the loader.
    const expectedPath: string = '../../../lib/test/testData/LoadThemedStylesMock';
    const stats = await getCompiler('./MockStyle1.css', {
      loadThemedStylesPath: expectedPath,
      esModule: true
    });
    if (stats !== undefined) {
      const content = stats.toJson({ source: true }).modules?.[0].source;

      expect(content).toMatchSnapshot('LoaderContent ESModule');
    }
  });

  it('generates desired loader output snapshot', async () => {
    const expectedPath: string = '../../../lib/test/testData/LoadThemedStylesMock';
    const stats = await getCompiler('./MockStyle1.css', { loadThemedStylesPath: expectedPath });
    if (stats !== undefined) {
      const content = stats.toJson({ source: true }).modules?.[0].source;

      expect(content).toMatchSnapshot('LoaderContent');
    }
  });
});
