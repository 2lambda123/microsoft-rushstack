// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileConstants, FileSystem, PosixModeBits } from '@rushstack/node-core-library';
import * as tar from 'tar';
import * as path from 'path';

import type { RushConfigurationProject } from '../api/RushConfigurationProject';
import type { RushConfiguration } from '../api/RushConfiguration';
import { RushConstants } from './RushConstants';

// The PosixModeBits are intended to be used with bitwise operations.
/* eslint-disable no-bitwise */

export class TempProjectHelper {
  private _rushConfiguration: RushConfiguration;

  public constructor(rushConfiguration: RushConfiguration) {
    this._rushConfiguration = rushConfiguration;
  }

  /**
   * Deletes the existing tarball and creates a tarball for the given rush project
   */
  public createTempProjectTarball(
    rushProject: RushConfigurationProject,
    subspaceName: string | undefined
  ): void {
    FileSystem.ensureFolder(
      path.resolve(this._rushConfiguration.getCommonTempFolder(subspaceName), 'projects')
    );
    const tarballFile: string = this.getTarballFilePath(rushProject, subspaceName);
    const tempProjectFolder: string = this.getTempProjectFolder(rushProject, subspaceName);

    FileSystem.deleteFile(tarballFile);

    // NPM expects the root of the tarball to have a directory called 'package'
    const npmPackageFolder: string = 'package';

    const tarOptions: tar.CreateOptions = {
      gzip: true,
      file: tarballFile,
      cwd: tempProjectFolder,
      portable: true,
      noMtime: true,
      noPax: true,
      sync: true,
      prefix: npmPackageFolder,
      filter: (tarPath: string, stat: tar.FileStat): boolean => {
        if (
          !this._rushConfiguration.experimentsConfiguration.configuration.noChmodFieldInTarHeaderNormalization
        ) {
          stat.mode =
            (stat.mode & ~0x1ff) | PosixModeBits.AllRead | PosixModeBits.UserWrite | PosixModeBits.AllExecute;
        }
        return true;
      }
    } as tar.CreateOptions;
    // create the new tarball
    tar.create(tarOptions, [FileConstants.PackageJson]);
  }

  /**
   * Gets the path to the tarball
   * Example: "C:\MyRepo\common\temp\projects\my-project-2.tgz"
   */
  public getTarballFilePath(project: RushConfigurationProject, subspaceName: string | undefined): string {
    return path.join(
      this._rushConfiguration.getCommonTempFolder(subspaceName),
      RushConstants.rushTempProjectsFolderName,
      `${project.unscopedTempProjectName}.tgz`
    );
  }

  public getTempProjectFolder(
    rushProject: RushConfigurationProject,
    subspaceName: string | undefined
  ): string {
    const unscopedTempProjectName: string = rushProject.unscopedTempProjectName;
    return path.join(
      this._rushConfiguration.getCommonTempFolder(subspaceName),
      RushConstants.rushTempProjectsFolderName,
      unscopedTempProjectName
    );
  }
}
