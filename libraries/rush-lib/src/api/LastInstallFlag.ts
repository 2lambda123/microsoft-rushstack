// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { JsonFile, Import, IPackageJson } from '@rushstack/node-core-library';
import { BaseFlag } from './base/BaseFlag';

import type { PackageManagerName } from './packageManager/PackageManager';
import type { RushConfiguration } from './RushConfiguration';

const lodash: typeof import('lodash') = Import.lazy('lodash', require);

export const LAST_INSTALL_FLAG_FILE_NAME: string = 'last-install.flag';

/**
 * This represents the JSON data structure for the "last-install.flag" file.
 * @internal
 */
export interface ILastInstallFlagJson {
  /**
   * Current node version
   */
  node: string;
  /**
   * Current package manager name
   */
  packageManager: PackageManagerName;
  /**
   * Current package manager version
   */
  packageManagerVersion: string;
  /**
   * Current rush json folder
   */
  rushJsonFolder: string;
  /**
   * The content of package.json, used in the flag file of autoinstaller
   */
  packageJson?: IPackageJson;
  /**
   * Same with pnpmOptions.pnpmStorePath in rush.json
   */
  storePath?: string;
  /**
   * True when "useWorkspaces" is true in rush.json
   */
  workspaces?: true;
  /**
   * True when user explicitly specify "--ignore-scripts" CLI parameter or deferredInstallationScripts
   */
  ignoreScripts?: true;
  /**
   * When specified, it is a list of selected projects during partial install
   * It is undefined when full install
   */
  selectedProjectNames?: string[];
}

/**
 * A helper class for managing last-install flags, which are persistent and
 * indicate that something installed in the folder was successfully completed.
 * It also compares state, so that if something like the Node.js version has changed,
 * it can invalidate the last install.
 * @internal
 */
export class LastInstallFlag extends BaseFlag<ILastInstallFlagJson> {
  /**
   * @override
   * Returns true if the file exists and the contents match the current state.
   */
  public isValid(): boolean {
    return this._isValid(false);
  }

  /**
   * Same as isValid(), but with an additional check:  If the current state is not equal to the previous
   * state, and an the current state causes an error, then throw an exception with a friendly message.
   *
   * @internal
   */
  public checkValidAndReportStoreIssues(): boolean {
    return this._isValid(true);
  }

  private _isValid(checkValidAndReportStoreIssues: boolean): boolean {
    let oldState: ILastInstallFlagJson;
    try {
      oldState = JsonFile.load(this.path);
    } catch (err) {
      return false;
    }

    const newState: ILastInstallFlagJson = this._state;

    if (!lodash.isEqual(oldState, newState)) {
      if (checkValidAndReportStoreIssues) {
        const pkgManager: PackageManagerName = newState.packageManager;
        if (pkgManager === 'pnpm') {
          if (
            // Only throw an error if the package manager hasn't changed from PNPM
            oldState.packageManager === pkgManager &&
            // Throw if the store path changed
            oldState.storePath !== newState.storePath
          ) {
            const oldStorePath: string = oldState.storePath || '<global>';
            const newStorePath: string = newState.storePath || '<global>';

            throw new Error(
              'Current PNPM store path does not match the last one used. This may cause inconsistency in your builds.\n\n' +
                'If you wish to install with the new store path, please run "rush update --purge"\n\n' +
                `Old Path: ${oldStorePath}\n` +
                `New Path: ${newStorePath}`
            );
          }

          // check ignoreScripts
          if (newState.ignoreScripts !== oldState.ignoreScripts) {
            return false;
          } else {
            // full install
            if (newState.selectedProjectNames === oldState.selectedProjectNames) {
              return true;
            }
          }

          // check whether new selected projects are installed
          if (newState.selectedProjectNames) {
            if (!oldState.selectedProjectNames) {
              // used to be a full install
              return true;
            } else if (
              lodash.difference(newState.selectedProjectNames, oldState.selectedProjectNames).length === 0
            ) {
              // current selected projects are included in old selected projects
              return true;
            }
          }
        }
      }
      return false;
    }

    return true;
  }

  /**
   * Returns the name of the flag file
   */
  protected get flagName(): string {
    return LAST_INSTALL_FLAG_FILE_NAME;
  }
}

/**
 * A helper class for LastInstallFlag
 *
 * @internal
 */
export class LastInstallFlagFactory {
  /**
   * Gets the LastInstall flag and sets the current state. This state is used to compare
   * against the last-known-good state tracked by the LastInstall flag.
   * @param rushConfiguration - the configuration of the Rush repo to get the install
   * state from
   *
   * @internal
   */
  public static getCommonTempFlag(rushConfiguration: RushConfiguration): LastInstallFlag {
    const currentState: ILastInstallFlagJson = {
      node: process.versions.node,
      packageManager: rushConfiguration.packageManager,
      packageManagerVersion: rushConfiguration.packageManagerToolVersion,
      rushJsonFolder: rushConfiguration.rushJsonFolder
    };

    if (currentState.packageManager === 'pnpm' && rushConfiguration.pnpmOptions) {
      currentState.storePath = rushConfiguration.pnpmOptions.pnpmStorePath;
      if (rushConfiguration.pnpmOptions.useWorkspaces) {
        currentState.workspaces = rushConfiguration.pnpmOptions.useWorkspaces;
      }
    }

    return new LastInstallFlag(rushConfiguration.commonTempFolder, currentState);
  }
}
