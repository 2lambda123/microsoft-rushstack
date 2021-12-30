// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'fs';
import { CompilerOptions, MapLike } from 'typescript';
import { Path } from './Path';

export type InputFileMessageIds =
  | 'file-in-packets-folder'
  | 'invalid-packlet-name'
  | 'misplaced-packlets-folder'
  | 'missing-src-folder'
  | 'missing-tsconfig'
  | 'packlet-folder-case';

export type ImportMessageIds =
  | 'bypassed-entry-point'
  | 'circular-entry-point'
  | 'packlet-importing-project-file';

export interface IAnalyzerError {
  messageId: InputFileMessageIds | ImportMessageIds;
  data?: Readonly<Record<string, unknown>>;
}

export class PackletAnalyzer {
  private static _validPackletName: RegExp = /^[a-z0-9]+(-[a-z0-9]+)*$/;

  /**
   * The input file being linted.
   *
   * Example: "/path/to/my-project/src/file.ts"
   */
  public readonly inputFilePath: string;

  /**
   * An error that occurred while analyzing the inputFilePath.
   */
  public readonly error: IAnalyzerError | undefined;

  /**
   * Returned to indicate that the linter can ignore this file.  Possible reasons:
   * - It's outside the "src" folder
   * - The project doesn't define any packlets
   */
  public readonly nothingToDo: boolean;

  /**
   * If true, then the "src/packlets" folder exists.
   */
  public readonly projectUsesPacklets: boolean;

  /**
   * The absolute path of the "src/packlets" folder.
   */
  public readonly packletsFolderPath: string | undefined;

  /**
   * The packlet that the inputFilePath is under, if any.
   */
  public readonly inputFilePackletName: string | undefined;

  /**
   * Returns true if inputFilePath belongs to a packlet and is the entry point index.ts.
   */
  public readonly isEntryPoint: boolean;

  /**
   * We want to ensure packlets don't import local code outside of other packlets,
   * in typescript projects we can set path aliases in the compilerOptions.paths definition.
   * This extends our import checks to include these path aliases.
   * Example { "compilerOptions": { "paths": { "@my-org/*": ['app/*'], "@tools": ['tools'] } } }
   */
  public isModulePathAnAlias: (modulePath: string) => boolean = () => false;

  private constructor(inputFilePath: string, compilerOptions: CompilerOptions) {
    this.inputFilePath = inputFilePath;
    this.error = undefined;
    this.nothingToDo = false;
    this.projectUsesPacklets = false;
    this.packletsFolderPath = undefined;
    this.inputFilePackletName = undefined;
    this.isEntryPoint = false;

    // Example: /path/to/my-project/src
    let srcFolderPath: string | undefined;
    // Example: /path/to/my-project/tsconfig.json
    const tsconfigFilePath: string | undefined = compilerOptions['configFilePath'] as string;

    if (!tsconfigFilePath) {
      this.error = { messageId: 'missing-tsconfig' };
      return;
    }

    srcFolderPath = Path.join(Path.dirname(tsconfigFilePath), 'src');

    if (!fs.existsSync(srcFolderPath)) {
      this.error = { messageId: 'missing-src-folder', data: { srcFolderPath } };
      return;
    }

    if (!Path.isUnder(inputFilePath, srcFolderPath)) {
      // Ignore files outside the "src" folder
      this.nothingToDo = true;
      return;
    }

    // Example: packlets/my-packlet/index.ts
    const inputFilePathRelativeToSrc: string = Path.relative(srcFolderPath, inputFilePath);

    // Example: [ 'packlets', 'my-packlet', 'index.ts' ]
    const pathParts: string[] = inputFilePathRelativeToSrc.split(/[\/\\]+/);

    const expectedPackletsFolder: string = Path.join(srcFolderPath, 'packlets');

    // Construct the path alias tester
    // Example { "compilerOptions": { "paths": { "@my-org/*": ['app/*'], "@tools": ['tools'] } } }
    const tsconfigPaths: MapLike<string[]> = compilerOptions.paths ? compilerOptions.paths : {};
    // Remove any path mappings which are pointing to src/packlets, or node_modules
    // (this would be nice to make configurable)
    const nonPackletMappings: [string, string[]][] = Object.entries(tsconfigPaths).filter(
      ([, paths]) =>
        !paths.some((path) => path.startsWith('src/packlets') || path.startsWith('node_modules/'))
    );
    // Create a test for each compilerOptions.paths to test that the
    const tsconfigPathTests: RegExp[] = nonPackletMappings
      .map(([alias]) => alias) // get just the aliases
      .map((alias) => alias.replace('/*', '')) // '@my-org/*' -> '@my-org', '@tools' -> '@tools'
      .map((alias) => new RegExp(`^${alias}$|^${alias}\/`));
    this.isModulePathAnAlias = (modulePath: string): boolean =>
      tsconfigPathTests.some((re) => re.test(modulePath));

    let underPackletsFolder: boolean = false;

    for (let i = 0; i < pathParts.length; ++i) {
      const pathPart: string = pathParts[i];
      if (pathPart.toUpperCase() === 'PACKLETS') {
        if (pathPart !== 'packlets') {
          // Example: /path/to/my-project/src/PACKLETS
          const packletsFolderPath: string = Path.join(srcFolderPath, ...pathParts.slice(0, i + 1));
          this.error = { messageId: 'packlet-folder-case', data: { packletsFolderPath } };
          return;
        }

        if (i !== 0) {
          this.error = { messageId: 'misplaced-packlets-folder', data: { expectedPackletsFolder } };
          return;
        }

        underPackletsFolder = true;
      }
    }

    if (underPackletsFolder || fs.existsSync(expectedPackletsFolder)) {
      // packletsAbsolutePath
      this.projectUsesPacklets = true;
      this.packletsFolderPath = expectedPackletsFolder;
    }

    if (underPackletsFolder) {
      if (pathParts.length === 2) {
        // Example: src/packlets/SomeFile.ts
        this.error = { messageId: 'file-in-packets-folder' };
        return;
      }
      if (pathParts.length >= 2) {
        // Example: 'my-packlet'
        const packletName: string = pathParts[1];
        this.inputFilePackletName = packletName;

        if (pathParts.length === 3) {
          // Example: 'index.ts' or 'index.tsx'
          const thirdPart: string = pathParts[2];

          // Example: 'index'
          const thirdPartWithoutExtension: string = Path.parse(thirdPart).name;

          if (thirdPartWithoutExtension.toUpperCase() === 'INDEX') {
            if (!PackletAnalyzer._validPackletName.test(packletName)) {
              this.error = { messageId: 'invalid-packlet-name', data: { packletName } };
              return;
            }

            this.isEntryPoint = true;
          }
        }
      }
    }

    if (this.error === undefined && !this.projectUsesPacklets) {
      this.nothingToDo = true;
    }
  }

  public static analyzeInputFile(inputFilePath: string, tsconfigCompilerOptions: CompilerOptions) {
    return new PackletAnalyzer(inputFilePath, tsconfigCompilerOptions);
  }

  public analyzeImport(modulePath: string): IAnalyzerError | undefined {
    if (!this.packletsFolderPath) {
      // The caller should ensure this can never happen
      throw new Error('Internal error: packletsFolderPath is not defined');
    }

    // Example: /path/to/my-project/src/packlets/my-packlet
    const inputFileFolder: string = Path.dirname(this.inputFilePath);

    // Example: /path/to/my-project/src/other-packlet/index
    const importedPath: string = Path.resolve(inputFileFolder, modulePath);

    console.log(`modulePath: ${modulePath} tests ${this.isModulePathAnAlias(modulePath)}`);

    // Is the imported path referring to a file under the src/packlets folder?
    if (!this.isModulePathAnAlias(modulePath) && Path.isUnder(importedPath, this.packletsFolderPath)) {
      // Example: other-packlet/index
      const importedPathRelativeToPackletsFolder: string = Path.relative(
        this.packletsFolderPath,
        importedPath
      );
      // Example: [ 'other-packlet', 'index' ]
      const importedPathParts: string[] = importedPathRelativeToPackletsFolder.split(/[\/\\]+/);
      if (importedPathParts.length > 0) {
        // Example: 'other-packlet'
        const importedPackletName: string = importedPathParts[0];

        // We are importing from a packlet. Is the input file part of the same packlet?
        if (this.inputFilePackletName && importedPackletName === this.inputFilePackletName) {
          // Yes.  Then our import must NOT use the packlet entry point.

          // Example: 'index'
          //
          // We discard the file extension to handle a degenerate case like:
          //   import { X } from "../index.js";
          const lastPart: string = Path.parse(importedPathParts[importedPathParts.length - 1]).name;
          let pathToCompare: string;
          if (lastPart.toUpperCase() === 'INDEX') {
            // Example:
            //   importedPath = /path/to/my-project/src/other-packlet/index
            //   pathToCompare = /path/to/my-project/src/other-packlet
            pathToCompare = Path.dirname(importedPath);
          } else {
            pathToCompare = importedPath;
          }

          // Example: /path/to/my-project/src/other-packlet
          const entryPointPath: string = Path.join(this.packletsFolderPath, importedPackletName);

          if (Path.isEqual(pathToCompare, entryPointPath)) {
            return {
              messageId: 'circular-entry-point'
            };
          }
        } else {
          // No.  If we are not part of the same packlet, then the module path must refer
          // to the index.ts entry point.

          // Example: /path/to/my-project/src/other-packlet
          const entryPointPath: string = Path.join(this.packletsFolderPath, importedPackletName);

          if (!Path.isEqual(importedPath, entryPointPath)) {
            // Example: "../packlets/other-packlet"
            const entryPointModulePath: string = Path.convertToSlashes(
              Path.relative(inputFileFolder, entryPointPath)
            );

            return {
              messageId: 'bypassed-entry-point',
              data: { entryPointModulePath }
            };
          }
        }
      }
    } else {
      // The imported path does NOT refer to a file under the src/packlets folder
      if (this.inputFilePackletName) {
        return {
          messageId: 'packlet-importing-project-file'
        };
      }
    }

    return undefined;
  }
}
