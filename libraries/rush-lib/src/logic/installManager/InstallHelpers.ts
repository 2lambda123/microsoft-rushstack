// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import {
  FileConstants,
  FileSystem,
  type IPackageJson,
  JsonFile,
  LockFile
} from '@rushstack/node-core-library';
import { Colorize } from '@rushstack/terminal';

import { LastInstallFlag } from '../../api/LastInstallFlag';
import type { PackageManagerName } from '../../api/packageManager/PackageManager';
import type { RushConfiguration } from '../../api/RushConfiguration';
import type { RushGlobalFolder } from '../../api/RushGlobalFolder';
import { Utilities } from '../../utilities/Utilities';
import type { IConfigurationEnvironment } from '../base/BasePackageManagerOptionsConfiguration';
import type { PnpmOptionsConfiguration } from '../pnpm/PnpmOptionsConfiguration';
import { merge } from '../../utilities/objectUtilities';
import type { Subspace } from '../../api/Subspace';
import { RushConstants } from '../RushConstants';

interface ICommonPackageJson extends IPackageJson {
  pnpm?: {
    overrides?: typeof PnpmOptionsConfiguration.prototype.globalOverrides;
    packageExtensions?: typeof PnpmOptionsConfiguration.prototype.globalPackageExtensions;
    peerDependencyRules?: typeof PnpmOptionsConfiguration.prototype.globalPeerDependencyRules;
    neverBuiltDependencies?: typeof PnpmOptionsConfiguration.prototype.globalNeverBuiltDependencies;
    allowedDeprecatedVersions?: typeof PnpmOptionsConfiguration.prototype.globalAllowedDeprecatedVersions;
    patchedDependencies?: typeof PnpmOptionsConfiguration.prototype.globalPatchedDependencies;
  };
}

export class InstallHelpers {
  public static generateCommonPackageJson(
    rushConfiguration: RushConfiguration,
    subspace: Subspace,
    dependencies: Map<string, string> = new Map<string, string>()
  ): void {
    const commonPackageJson: ICommonPackageJson = {
      dependencies: {},
      description: 'Temporary file generated by the Rush tool',
      name: 'rush-common',
      private: true,
      version: '0.0.0'
    };

    if (rushConfiguration.packageManager === 'pnpm') {
      const pnpmOptions: PnpmOptionsConfiguration = subspace.getPnpmOptions();
      if (!commonPackageJson.pnpm) {
        commonPackageJson.pnpm = {};
      }

      if (pnpmOptions.globalOverrides) {
        commonPackageJson.pnpm.overrides = pnpmOptions.globalOverrides;
      }

      if (pnpmOptions.globalPackageExtensions) {
        commonPackageJson.pnpm.packageExtensions = pnpmOptions.globalPackageExtensions;
      }
      if (pnpmOptions.globalPeerDependencyRules) {
        commonPackageJson.pnpm.peerDependencyRules = pnpmOptions.globalPeerDependencyRules;
      }

      if (pnpmOptions.globalNeverBuiltDependencies) {
        commonPackageJson.pnpm.neverBuiltDependencies = pnpmOptions.globalNeverBuiltDependencies;
      }

      if (pnpmOptions.globalAllowedDeprecatedVersions) {
        commonPackageJson.pnpm.allowedDeprecatedVersions = pnpmOptions.globalAllowedDeprecatedVersions;
      }

      if (pnpmOptions.globalPatchedDependencies) {
        commonPackageJson.pnpm.patchedDependencies = pnpmOptions.globalPatchedDependencies;
      }

      if (pnpmOptions.unsupportedPackageJsonSettings) {
        merge(commonPackageJson, pnpmOptions.unsupportedPackageJsonSettings);
      }
    }

    // Add any preferred versions to the top of the commonPackageJson
    // do this in alphabetical order for simpler debugging
    for (const dependency of Array.from(dependencies.keys()).sort()) {
      commonPackageJson.dependencies![dependency] = dependencies.get(dependency)!;
    }

    // Example: "C:\MyRepo\common\temp\package.json"
    const commonPackageJsonFilename: string = path.join(
      subspace.getSubspaceTempFolder(),
      FileConstants.PackageJson
    );

    // Don't update the file timestamp unless the content has changed, since "rush install"
    // will consider this timestamp
    JsonFile.save(commonPackageJson, commonPackageJsonFilename, { onlyIfChanged: true });
  }

  public static getPackageManagerEnvironment(
    rushConfiguration: RushConfiguration,
    options: {
      debug?: boolean;
    } = {}
  ): NodeJS.ProcessEnv {
    let configurationEnvironment: IConfigurationEnvironment | undefined = undefined;

    if (rushConfiguration.packageManager === 'npm') {
      if (rushConfiguration.npmOptions && rushConfiguration.npmOptions.environmentVariables) {
        configurationEnvironment = rushConfiguration.npmOptions.environmentVariables;
      }
    } else if (rushConfiguration.packageManager === 'pnpm') {
      if (
        rushConfiguration.defaultSubspace.getPnpmOptions() &&
        rushConfiguration.defaultSubspace.getPnpmOptions().environmentVariables
      ) {
        configurationEnvironment = rushConfiguration.defaultSubspace.getPnpmOptions().environmentVariables;
      }
    } else if (rushConfiguration.packageManager === 'yarn') {
      if (rushConfiguration.yarnOptions && rushConfiguration.yarnOptions.environmentVariables) {
        configurationEnvironment = rushConfiguration.yarnOptions.environmentVariables;
      }
    }

    return InstallHelpers._mergeEnvironmentVariables(process.env, configurationEnvironment, options);
  }

  /**
   * If the "(p)npm-local" symlink hasn't been set up yet, this creates it, installing the
   * specified (P)npm version in the user's home directory if needed.
   */
  public static async ensureLocalPackageManager(
    rushConfiguration: RushConfiguration,
    rushGlobalFolder: RushGlobalFolder,
    maxInstallAttempts: number,
    restrictConsoleOutput?: boolean
  ): Promise<void> {
    let logIfConsoleOutputIsNotRestricted: (message?: string) => void;
    if (restrictConsoleOutput) {
      logIfConsoleOutputIsNotRestricted = () => {
        /* noop */
      };
    } else {
      logIfConsoleOutputIsNotRestricted = (message?: string) => {
        // eslint-disable-next-line no-console
        console.log(message);
      };
    }

    // Example: "C:\Users\YourName\.rush"
    const rushUserFolder: string = rushGlobalFolder.nodeSpecificPath;

    if (!FileSystem.exists(rushUserFolder)) {
      logIfConsoleOutputIsNotRestricted('Creating ' + rushUserFolder);
      FileSystem.ensureFolder(rushUserFolder);
    }

    const packageManager: PackageManagerName = rushConfiguration.packageManager;
    const packageManagerVersion: string = rushConfiguration.packageManagerToolVersion;

    const packageManagerAndVersion: string = `${packageManager}-${packageManagerVersion}`;
    // Example: "C:\Users\YourName\.rush\pnpm-1.2.3"
    const packageManagerToolFolder: string = path.join(rushUserFolder, packageManagerAndVersion);

    const packageManagerMarker: LastInstallFlag = new LastInstallFlag(packageManagerToolFolder, {
      node: process.versions.node
    });

    logIfConsoleOutputIsNotRestricted(`Trying to acquire lock for ${packageManagerAndVersion}`);

    const lock: LockFile = await LockFile.acquire(rushUserFolder, packageManagerAndVersion);

    logIfConsoleOutputIsNotRestricted(`Acquired lock for ${packageManagerAndVersion}`);

    if (!packageManagerMarker.isValid() || lock.dirtyWhenAcquired) {
      logIfConsoleOutputIsNotRestricted(
        Colorize.bold(`Installing ${packageManager} version ${packageManagerVersion}\n`)
      );

      // note that this will remove the last-install flag from the directory
      Utilities.installPackageInDirectory({
        directory: packageManagerToolFolder,
        packageName: packageManager,
        version: rushConfiguration.packageManagerToolVersion,
        tempPackageTitle: `${packageManager}-local-install`,
        maxInstallAttempts: maxInstallAttempts,
        // This is using a local configuration to install a package in a shared global location.
        // Generally that's a bad practice, but in this case if we can successfully install
        // the package at all, we can reasonably assume it's good for all the repositories.
        // In particular, we'll assume that two different NPM registries cannot have two
        // different implementations of the same version of the same package.
        // This was needed for: https://github.com/microsoft/rushstack/issues/691
        commonRushConfigFolder: rushConfiguration.commonRushConfigFolder
      });

      logIfConsoleOutputIsNotRestricted(
        `Successfully installed ${packageManager} version ${packageManagerVersion}`
      );
    } else {
      logIfConsoleOutputIsNotRestricted(
        `Found ${packageManager} version ${packageManagerVersion} in ${packageManagerToolFolder}`
      );
    }

    packageManagerMarker.create();

    // Example: "C:\MyRepo\common\temp"
    FileSystem.ensureFolder(rushConfiguration.commonTempFolder);

    // Example: "C:\MyRepo\common\temp\pnpm-local"
    const localPackageManagerToolFolder: string = path.join(
      rushConfiguration.commonTempFolder,
      `${packageManager}-local`
    );

    logIfConsoleOutputIsNotRestricted(`\nSymlinking "${localPackageManagerToolFolder}"`);
    logIfConsoleOutputIsNotRestricted(`  --> "${packageManagerToolFolder}"`);

    // We cannot use FileSystem.exists() to test the existence of a symlink, because it will
    // return false for broken symlinks.  There is no way to test without catching an exception.
    try {
      FileSystem.deleteFolder(localPackageManagerToolFolder);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    FileSystem.createSymbolicLinkJunction({
      linkTargetPath: packageManagerToolFolder,
      newLinkPath: localPackageManagerToolFolder
    });

    lock.release();
  }

  // Helper for getPackageManagerEnvironment
  private static _mergeEnvironmentVariables(
    baseEnv: NodeJS.ProcessEnv,
    environmentVariables?: IConfigurationEnvironment,
    options: {
      debug?: boolean;
    } = {}
  ): NodeJS.ProcessEnv {
    const packageManagerEnv: NodeJS.ProcessEnv = baseEnv;

    if (environmentVariables) {
      // eslint-disable-next-line guard-for-in
      for (const envVar in environmentVariables) {
        let setEnvironmentVariable: boolean = true;
        // eslint-disable-next-line no-console
        console.log(`\nProcessing definition for environment variable: ${envVar}`);

        if (baseEnv.hasOwnProperty(envVar)) {
          setEnvironmentVariable = false;
          // eslint-disable-next-line no-console
          console.log(`Environment variable already defined:`);
          // eslint-disable-next-line no-console
          console.log(`  Name: ${envVar}`);
          // eslint-disable-next-line no-console
          console.log(`  Existing value: ${baseEnv[envVar]}`);
          // eslint-disable-next-line no-console
          console.log(
            `  Value set in ${RushConstants.rushJsonFilename}: ${environmentVariables[envVar].value}`
          );

          if (environmentVariables[envVar].override) {
            setEnvironmentVariable = true;
            // eslint-disable-next-line no-console
            console.log(
              `Overriding the environment variable with the value set in ${RushConstants.rushJsonFilename}.`
            );
          } else {
            // eslint-disable-next-line no-console
            console.log(Colorize.yellow(`WARNING: Not overriding the value of the environment variable.`));
          }
        }

        if (setEnvironmentVariable) {
          if (options.debug) {
            // eslint-disable-next-line no-console
            console.log(`Setting environment variable for package manager.`);
            // eslint-disable-next-line no-console
            console.log(`  Name: ${envVar}`);
            // eslint-disable-next-line no-console
            console.log(`  Value: ${environmentVariables[envVar].value}`);
          }
          packageManagerEnv[envVar] = environmentVariables[envVar].value;
        }
      }
    }

    return packageManagerEnv;
  }
}
