// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { dirname } from 'path';
import { appendFile } from 'fs-extra';

import { ensureFolderAsync } from './ensureFolderAsync';
import type { IFileSystemWriteFileOptions } from './interfaces';
import { isNotExistError } from './isNotExistError';
import { wrapExceptionAsync } from './wrapExceptionAsync';
import { Encoding, Text } from '../Text';

/**
 * An async version of {@link FileSystem.appendToFile}.
 */
export async function appendToFileAsync(
  filePath: string,
  contents: string | Buffer,
  options?: IFileSystemWriteFileOptions
): Promise<void> {
  await wrapExceptionAsync(async () => {
    const { ensureFolderExists = false, convertLineEndings, encoding = Encoding.Utf8 } = options || {};

    if (convertLineEndings) {
      contents = Text.convertTo(contents.toString(), convertLineEndings);
    }

    try {
      await appendFile(filePath, contents, { encoding: encoding });
    } catch (error) {
      if (ensureFolderExists) {
        if (!isNotExistError(error as Error)) {
          throw error;
        }

        const folderPath: string = dirname(filePath);
        await ensureFolderAsync(folderPath);
        await appendFile(filePath, contents, { encoding: encoding });
      } else {
        throw error;
      }
    }
  });
}
