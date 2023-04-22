// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as fs from 'fs';
import npmPacklist from 'npm-packlist';
import pnpmLinkBins from '@pnpm/link-bins';
import ignore, { Ignore } from 'ignore';
import {
  Async,
  AsyncQueue,
  Path,
  FileSystem,
  Import,
  Colors,
  JsonFile,
  AlreadyExistsBehavior,
  type IPackageJson,
  type ITerminal
} from '@rushstack/node-core-library';

import { DeployArchiver } from './DeployArchiver';
import { SymlinkAnalyzer, type ILinkInfo, type PathNode } from './SymlinkAnalyzer';
import { matchesWithStar } from './Utils';
import { createLinksScriptFilename, scriptsFolderPath } from './PathConstants';

/**
 * Part of the deploy-matadata.json file format. Represents a Rush project to be deployed.
 */
interface IProjectInfoJson {
  /**
   * This path is relative to the deploy folder.
   */
  path: string;
}

/**
 * The deploy-matadata.json file format.
 */
export interface IDeployMetadataJson {
  scenarioName: string;
  mainProjectName: string;
  projects: IProjectInfoJson[];
  links: ILinkInfo[];
}

interface IDeployState {
  foldersToCopy: Set<string>;
  projectConfigurationsByPath: Map<string, IDeployProjectConfiguration>;
  projectConfigurationsByName: Map<string, IDeployProjectConfiguration>;
  symlinkAnalyzer: SymlinkAnalyzer;
  archiver?: DeployArchiver;
}

/**
 * The deployment configuration for individual projects.
 *
 * @public
 */
export interface IDeployProjectConfiguration {
  /**
   * The name of the project.
   */
  projectName: string;
  /**
   * The absolute path to the project.
   */
  projectFolder: string;
  /**
   * The names of additional projects to include when deploying this project.
   */
  additionalProjectsToInclude?: string[];
  /**
   * The names of additional dependencies to include when deploying this project.
   */
  additionalDependenciesToInclude?: string[];
  /**
   * The names of additional dependencies to exclude when deploying this project.
   */
  dependenciesToExclude?: string[];
}

/**
 * This object tracks DeployManager state during a deployment.
 *
 * @public
 */
export interface IDeployOptions {
  /**
   * A terminal to log deployment progress.
   */
  terminal: ITerminal;

  /**
   * The main project to include in the deployment.
   */
  mainProjectName: string;

  /**
   * The name of the scenario being deployed. Included in the deploy-metadata.json file.
   */
  scenarioName: string;

  /**
   * The source folder that copying originates from.  Generally it is the repo root folder.
   */
  sourceRootFolder: string;

  /**
   * The target folder for the deployment.
   */
  targetRootFolder: string;

  /**
   * Whether to overwrite the target folder if it already exists.
   */
  overwriteExisting: boolean;

  /**
   * The desired path to be used when archiving the target folder. Supported file extensions: .zip.
   */
  createArchiveFilePath?: string;

  /**
   * Whether to skip creating a deploy directory, and only create a deploy archive. This is only
   * supported when linkCreation is 'script' or 'none'.
   */
  createArchiveOnly?: boolean;

  /**
   * The pnpmfile configuration if using PNPM, otherwise undefined. The configuration will be used to
   * transform the package.json prior to deploy.
   */
  transformPackageJson?: (packageJson: IPackageJson) => IPackageJson | undefined;

  /**
   * If dependencies from the "devDependencies" package.json field should be included in the deployment.
   */
  includeDevDependencies?: boolean;

  /**
   * If files ignored by the .npmignore file should be included in the deployment.
   */
  includeNpmIgnoreFiles?: boolean;

  /**
   * The folder where the PNPM "node_modules" folder is located. This is used to resolve packages linked
   * to the PNPM virtual store.
   */
  pnpmInstallFolder?: string;

  /**
   * The link creation mode to use.
   * "default": Create the links while copying the files; this is the default behavior. Use this setting
   * if your file copy tool can handle links correctly.
   * "script": A Node.js script called create-links.js will be written to the target folder. Use this setting
   * to create links on the server machine, after the files have been uploaded.
   * "none": Do nothing; some other tool may create the links later, based on the deploy-metadata.json file.
   */
  linkCreation?: 'default' | 'script' | 'none';

  /**
   * An additional folder containing files which will be copied into the root of the deployment.
   */
  folderToCopy?: string;

  /**
   * Configurations for individual projects, keyed by the project path relative to the sourceRootFolder.
   */
  projectConfigurations: IDeployProjectConfiguration[];
}

/**
 * Manages the business logic for the "rush deploy" command.
 *
 * @public
 */
export class DeployManager {
  /**
   * Perform a deployment using the provided options
   */
  public async deployAsync(options: IDeployOptions): Promise<void> {
    const {
      terminal,
      projectConfigurations,
      targetRootFolder,
      mainProjectName,
      overwriteExisting,
      createArchiveFilePath,
      createArchiveOnly
    } = options;

    if (createArchiveOnly) {
      if (options.linkCreation !== 'script' && options.linkCreation !== 'none') {
        throw new Error('createArchiveOnly is only supported when linkCreation is "script" or "none"');
      }
      if (!createArchiveFilePath) {
        throw new Error('createArchiveOnly is only supported when createArchiveFilePath is specified');
      }
    }

    let archiver: DeployArchiver | undefined;
    if (createArchiveFilePath) {
      if (path.extname(createArchiveFilePath) !== '.zip') {
        throw new Error('Only archives with the .zip file extension are currently supported.');
      }

      const archiveFilePath: string = path.resolve(targetRootFolder, createArchiveFilePath);
      archiver = new DeployArchiver({ archiveFilePath });
    }

    await FileSystem.ensureFolderAsync(targetRootFolder);

    terminal.writeLine(Colors.cyan(`Deploying to target folder:  ${targetRootFolder}`));
    terminal.writeLine(Colors.cyan(`Main project for deployment: ${mainProjectName}`));

    try {
      const existingDeployment: boolean =
        (await FileSystem.readFolderItemNamesAsync(targetRootFolder)).length > 0;
      if (existingDeployment) {
        if (!overwriteExisting) {
          throw new Error('The deploy target folder is not empty. Overwrite must be explicitly requested');
        } else {
          terminal.writeLine('Deleting target folder contents...');
          terminal.writeLine('');
          await FileSystem.ensureEmptyFolderAsync(targetRootFolder);
        }
      }
    } catch (error: unknown) {
      if (!FileSystem.isFolderDoesNotExistError(error as Error)) {
        throw error;
      }
    }

    // Create a new state for each run
    const state: IDeployState = {
      foldersToCopy: new Set(),
      projectConfigurationsByName: new Map(projectConfigurations.map((p) => [p.projectName, p])),
      projectConfigurationsByPath: new Map(projectConfigurations.map((p) => [p.projectFolder, p])),
      symlinkAnalyzer: new SymlinkAnalyzer(),
      archiver
    };

    await this._performDeploymentAsync(options, state);
  }

  private async _performDeploymentAsync(options: IDeployOptions, state: IDeployState): Promise<void> {
    const {
      terminal,
      mainProjectName,
      sourceRootFolder,
      targetRootFolder,
      folderToCopy: addditionalFolderToCopy,
      linkCreation
    } = options;
    const { projectConfigurationsByName, foldersToCopy, symlinkAnalyzer, archiver } = state;

    const mainProjectConfiguration: IDeployProjectConfiguration | undefined =
      projectConfigurationsByName.get(mainProjectName);
    if (!mainProjectConfiguration) {
      throw new Error(`Main project "${mainProjectName}" was not found in the list of projects`);
    }

    // Calculate the set with additionalProjectsToInclude
    const includedProjectsSet: Set<IDeployProjectConfiguration> = new Set([mainProjectConfiguration]);
    for (const { additionalProjectsToInclude } of includedProjectsSet) {
      if (additionalProjectsToInclude) {
        for (const additionalProjectNameToInclude of additionalProjectsToInclude) {
          const additionalProjectToInclude: IDeployProjectConfiguration | undefined =
            projectConfigurationsByName.get(additionalProjectNameToInclude);
          if (!additionalProjectToInclude) {
            throw new Error(
              `Project "${additionalProjectNameToInclude}" was not found in the list of projects.`
            );
          }
          includedProjectsSet.add(additionalProjectToInclude);
        }
      }
    }

    for (const { projectName, projectFolder } of includedProjectsSet) {
      terminal.writeLine(Colors.cyan(`Analyzing project: ${projectName}`));
      await this._collectFoldersAsync(projectFolder, options, state);
    }

    if (!options.createArchiveOnly) {
      terminal.writeLine(`Copying folders to target folder "${targetRootFolder}"`);
    }
    await Async.forEachAsync(
      foldersToCopy,
      async (folderToCopy: string) => {
        await this._deployFolderAsync(folderToCopy, options, state);
      },
      {
        concurrency: 10
      }
    );

    switch (linkCreation) {
      case 'script': {
        const sourceFilePath: string = path.join(scriptsFolderPath, createLinksScriptFilename);
        if (!options.createArchiveOnly) {
          terminal.writeLine(`Creating ${createLinksScriptFilename}`);
          await FileSystem.copyFileAsync({
            sourcePath: sourceFilePath,
            destinationPath: path.join(targetRootFolder, createLinksScriptFilename),
            alreadyExistsBehavior: AlreadyExistsBehavior.Error
          });
        }
        await state.archiver?.addToArchiveAsync({
          filePath: sourceFilePath,
          archivePath: createLinksScriptFilename
        });
        break;
      }
      case 'default': {
        terminal.writeLine('Creating symlinks');
        const linksToCopy: ILinkInfo[] = symlinkAnalyzer.reportSymlinks();
        await Async.forEachAsync(linksToCopy, async (linkToCopy: ILinkInfo) => {
          await this._deploySymlinkAsync(linkToCopy, options, state);
        });
        await Async.forEachAsync(
          includedProjectsSet,
          async (project: IDeployProjectConfiguration) => {
            await this._makeBinLinksAsync(project.projectFolder, options, state);
          },
          {
            concurrency: 10
          }
        );
        break;
      }
      default: {
        break;
      }
    }

    terminal.writeLine('Creating deploy-metadata.json');
    await this._writeDeployMetadataAsync(options, state);

    if (addditionalFolderToCopy) {
      const sourceFolderPath: string = path.resolve(sourceRootFolder, addditionalFolderToCopy);
      await FileSystem.copyFilesAsync({
        sourcePath: sourceFolderPath,
        destinationPath: targetRootFolder,
        alreadyExistsBehavior: AlreadyExistsBehavior.Error
      });
    }

    if (archiver) {
      terminal.writeLine(`Creating archive at "${archiver.archiveFilePath}"`);
      await archiver.createArchiveAsync();
    }
  }

  /**
   * Recursively crawl the node_modules dependencies and collect the result in IDeployState.foldersToCopy.
   */
  private async _collectFoldersAsync(
    packageJsonFolder: string,
    options: IDeployOptions,
    state: IDeployState
  ): Promise<void> {
    const { terminal, pnpmInstallFolder, transformPackageJson } = options;
    const { projectConfigurationsByPath } = state;

    const packageJsonFolderPathQueue: AsyncQueue<string> = new AsyncQueue([packageJsonFolder]);

    await Async.forEachAsync(
      packageJsonFolderPathQueue,
      async ([packageJsonFolderPath, callback]: [string, () => void]) => {
        const packageJsonRealFolderPath: string = await FileSystem.getRealPathAsync(packageJsonFolderPath);
        if (state.foldersToCopy.has(packageJsonRealFolderPath)) {
          // we've already seen this folder
          callback();
          return;
        }
        state.foldersToCopy.add(packageJsonRealFolderPath);

        const originalPackageJson: IPackageJson = await JsonFile.loadAsync(
          path.join(packageJsonRealFolderPath, 'package.json')
        );

        // Transform packageJson using the provided transformer, if requested
        const packageJson: IPackageJson = transformPackageJson?.(originalPackageJson) ?? originalPackageJson;

        // Union of keys from regular dependencies, peerDependencies, optionalDependencies
        // (and possibly devDependencies if includeDevDependencies=true)
        const dependencyNamesToProcess: Set<string> = new Set<string>();

        // Just the keys from optionalDependencies and peerDependencies
        const optionalDependencyNames: Set<string> = new Set<string>();

        for (const name of Object.keys(packageJson.dependencies || {})) {
          dependencyNamesToProcess.add(name);
        }
        for (const name of Object.keys(packageJson.peerDependencies || {})) {
          dependencyNamesToProcess.add(name);
          optionalDependencyNames.add(name); // consider peers optional, since they are so frequently broken
        }
        for (const name of Object.keys(packageJson.optionalDependencies || {})) {
          dependencyNamesToProcess.add(name);
          optionalDependencyNames.add(name);
        }

        // Check to see if this is a local project
        const projectConfiguration: IDeployProjectConfiguration | undefined =
          projectConfigurationsByPath.get(packageJsonRealFolderPath);

        if (projectConfiguration) {
          if (options.includeDevDependencies) {
            for (const name of Object.keys(packageJson.devDependencies || {})) {
              dependencyNamesToProcess.add(name);
            }
          }

          this._applyDependencyFilters(
            terminal,
            dependencyNamesToProcess,
            projectConfiguration.additionalDependenciesToInclude,
            projectConfiguration.dependenciesToExclude
          );
        }

        for (const dependencyPackageName of dependencyNamesToProcess) {
          try {
            const dependencyPackageFolderPath: string = await Import.resolvePackageAsync({
              packageName: dependencyPackageName,
              baseFolderPath: packageJsonRealFolderPath,
              getRealPathAsync: async (filePath: string) => {
                try {
                  return (await state.symlinkAnalyzer.analyzePathAsync(filePath)).nodePath;
                } catch (error: unknown) {
                  if (FileSystem.isFileDoesNotExistError(error as Error)) {
                    return filePath;
                  }
                  throw error;
                }
              }
            });
            packageJsonFolderPathQueue.push(dependencyPackageFolderPath);
          } catch (resolveErr) {
            if (optionalDependencyNames.has(dependencyPackageName)) {
              // Ignore missing optional dependency
              continue;
            }
            throw resolveErr;
          }
        }

        // Replicate the links to the virtual store.
        // Only apply this logic for packages that were actually installed under the common/temp folder.
        if (pnpmInstallFolder && Path.isUnder(packageJsonFolderPath, pnpmInstallFolder)) {
          try {
            // The PNPM virtual store links are created in this folder.  We will resolve the current package
            // from that location and collect any additional links encountered along the way.
            // TODO: This can be configured via NPMRC. We should support that.
            const pnpmDotFolderPath: string = path.join(pnpmInstallFolder, 'node_modules', '.pnpm');

            // TODO: Investigate how package aliases are handled by PNPM in this case.  For example:
            //
            // "dependencies": {
            //   "alias-name": "npm:real-name@^1.2.3"
            // }
            const dependencyPackageFolderPath: string = await Import.resolvePackageAsync({
              packageName: packageJson.name,
              baseFolderPath: pnpmDotFolderPath,
              getRealPathAsync: async (filePath: string) => {
                try {
                  return (await state.symlinkAnalyzer.analyzePathAsync(filePath)).nodePath;
                } catch (error: unknown) {
                  if (FileSystem.isFileDoesNotExistError(error as Error)) {
                    return filePath;
                  }
                  throw error;
                }
              }
            });
            packageJsonFolderPathQueue.push(dependencyPackageFolderPath);
          } catch (resolveErr) {
            // The virtual store link isn't guaranteed to exist, so ignore if it's missing
            // NOTE: If you encounter this warning a lot, please report it to the Rush maintainers.
            console.log('Ignoring missing PNPM virtual store link for ' + packageJsonFolderPath);
          }
        }

        callback();
      },
      {
        concurrency: 10
      }
    );
  }

  private _applyDependencyFilters(
    terminal: ITerminal,
    allDependencyNames: Set<string>,
    additionalDependenciesToInclude: string[] = [],
    dependenciesToExclude: string[] = []
  ): Set<string> {
    // Track packages that got added/removed for reporting purposes
    const extraIncludedPackageNames: string[] = [];
    const extraExcludedPackageNames: string[] = [];

    for (const patternWithStar of dependenciesToExclude) {
      for (const dependency of allDependencyNames) {
        if (matchesWithStar(patternWithStar, dependency)) {
          if (allDependencyNames.delete(dependency)) {
            extraExcludedPackageNames.push(dependency);
          }
        }
      }
    }

    for (const dependencyToInclude of additionalDependenciesToInclude) {
      if (!allDependencyNames.has(dependencyToInclude)) {
        allDependencyNames.add(dependencyToInclude);
        extraIncludedPackageNames.push(dependencyToInclude);
      }
    }

    if (extraIncludedPackageNames.length > 0) {
      extraIncludedPackageNames.sort();
      terminal.writeLine(`Extra dependencies included by settings: ${extraIncludedPackageNames.join(', ')}`);
    }

    if (extraExcludedPackageNames.length > 0) {
      extraExcludedPackageNames.sort();
      terminal.writeLine(`Extra dependencies excluded by settings: ${extraExcludedPackageNames.join(', ')}`);
    }

    return allDependencyNames;
  }

  /**
   * Maps a file path from IDeployOptions.sourceRootFolder to IDeployOptions.targetRootFolder
   *
   * Example input: "C:\\MyRepo\\libraries\\my-lib"
   * Example output: "C:\\MyRepo\\common\\deploy\\libraries\\my-lib"
   */
  private _remapPathForDeployFolder(absolutePathInSourceFolder: string, options: IDeployOptions): string {
    const { sourceRootFolder, targetRootFolder } = options;
    const relativePath: string = path.relative(sourceRootFolder, absolutePathInSourceFolder);
    if (relativePath.startsWith('..')) {
      throw new Error(`Source path "${absolutePathInSourceFolder}" is not under "${sourceRootFolder}"`);
    }
    const absolutePathInTargetFolder: string = path.join(targetRootFolder, relativePath);
    return absolutePathInTargetFolder;
  }

  /**
   * Maps a file path from IDeployOptions.sourceRootFolder to relative path
   *
   * Example input: "C:\\MyRepo\\libraries\\my-lib"
   * Example output: "libraries/my-lib"
   */
  private _remapPathForDeployMetadata(absolutePathInSourceFolder: string, options: IDeployOptions): string {
    const { sourceRootFolder } = options;
    const relativePath: string = path.relative(sourceRootFolder, absolutePathInSourceFolder);
    if (relativePath.startsWith('..')) {
      throw new Error(`Source path "${absolutePathInSourceFolder}" is not under "${sourceRootFolder}"`);
    }
    return relativePath.replace('\\', '/');
  }

  /**
   * Copy one package folder to the deployment target folder.
   */
  private async _deployFolderAsync(
    sourceFolderPath: string,
    options: IDeployOptions,
    state: IDeployState
  ): Promise<void> {
    const { includeNpmIgnoreFiles, targetRootFolder } = options;
    const { projectConfigurationsByPath, archiver } = state;
    let useNpmIgnoreFilter: boolean = false;

    if (!includeNpmIgnoreFiles) {
      const sourceFolderRealPath: string = await FileSystem.getRealPathAsync(sourceFolderPath);
      const sourceProjectConfiguration: IDeployProjectConfiguration | undefined =
        projectConfigurationsByPath.get(sourceFolderRealPath);
      if (sourceProjectConfiguration) {
        useNpmIgnoreFilter = true;
      }
    }

    const targetFolderPath: string = this._remapPathForDeployFolder(sourceFolderPath, options);

    if (useNpmIgnoreFilter) {
      // Use npm-packlist to filter the files.  Using the WalkerSync class (instead of the sync() API) ensures
      // that "bundledDependencies" are not included.
      const npmPackFiles: string[] = await npmPacklist({
        path: sourceFolderPath
      });

      const alreadyCopiedSourcePaths: Set<string> = new Set();

      await Async.forEachAsync(
        npmPackFiles,
        async (npmPackFile: string) => {
          // In issue https://github.com/microsoft/rushstack/issues/2121 we found that npm-packlist sometimes returns
          // duplicate file paths, for example:
          //
          //   'dist//index.js'
          //   'dist/index.js'
          //
          // We can detect the duplicates by comparing the path.resolve() result.
          const copySourcePath: string = path.resolve(sourceFolderPath, npmPackFile);
          if (alreadyCopiedSourcePaths.has(copySourcePath)) {
            return;
          }
          alreadyCopiedSourcePaths.add(copySourcePath);

          const copyDestinationPath: string = path.join(targetFolderPath, npmPackFile);
          const copySourcePathNode: PathNode = await state.symlinkAnalyzer.analyzePathAsync(copySourcePath);
          if (copySourcePathNode.kind !== 'link') {
            if (!options.createArchiveOnly) {
              await FileSystem.ensureFolderAsync(path.dirname(copyDestinationPath));
              // Use the fs.copyFile API instead of FileSystem.copyFileAsync() since copyFileAsync performs
              // a needless stat() call to determine if it's a file or folder, and we already know it's a file.
              await fs.promises.copyFile(copySourcePath, copyDestinationPath, fs.constants.COPYFILE_EXCL);
            }

            if (archiver) {
              const archivePath: string = path.relative(targetRootFolder, copyDestinationPath);
              await archiver.addToArchiveAsync({
                filePath: copySourcePath,
                archivePath,
                stats: copySourcePathNode.linkStats
              });
            }
          }
        },
        {
          concurrency: 10
        }
      );
    } else {
      // use a simplistic "ignore" ruleset to filter the files
      const ignoreFilter: Ignore = ignore();
      ignoreFilter.add([
        // The top-level node_modules folder is always excluded
        '/node_modules',
        // Also exclude well-known folders that can contribute a lot of unnecessary files
        '**/.git',
        '**/.svn',
        '**/.hg',
        '**/.DS_Store'
      ]);

      // Do a breadth-first search of the source folder, copying each file to the target folder
      const queue: AsyncQueue<string> = new AsyncQueue([sourceFolderPath]);
      await Async.forEachAsync(
        queue,
        async ([sourcePath, callback]: [string, () => void]) => {
          const relativeSourcePath: string = path.relative(sourceFolderPath, sourcePath);
          if (relativeSourcePath !== '' && ignoreFilter.ignores(relativeSourcePath)) {
            callback();
            return;
          }

          const sourcePathNode: PathNode = await state.symlinkAnalyzer.analyzePathAsync(sourcePath);
          if (sourcePathNode.kind === 'file') {
            const targetPath: string = path.join(targetFolderPath, relativeSourcePath);
            if (!options.createArchiveOnly) {
              // Manually call fs.copyFile to avoid unnecessary stat calls.
              await fs.promises.copyFile(sourcePath, targetPath, fs.constants.COPYFILE_EXCL);
            }

            // Add the file to the archive. Only need to add files since directories will be auto-created
            if (archiver) {
              const archivePath: string = path.relative(targetRootFolder, targetPath);
              await archiver.addToArchiveAsync({
                filePath: sourcePath,
                archivePath: archivePath,
                stats: sourcePathNode.linkStats
              });
            }
          } else if (sourcePathNode.kind === 'folder') {
            if (!options.createArchiveOnly) {
              const targetPath: string = path.join(targetFolderPath, relativeSourcePath);
              await FileSystem.ensureFolderAsync(targetPath);
            }
            const children: string[] = await FileSystem.readFolderItemNamesAsync(sourcePath);
            for (const child of children) {
              queue.push(path.join(sourcePath, child));
            }
          }

          callback();
        },
        {
          concurrency: 10
        }
      );
    }
  }

  /**
   * Create a symlink as described by the ILinkInfo object.
   */
  private async _deploySymlinkAsync(
    originalLinkInfo: ILinkInfo,
    options: IDeployOptions,
    state: IDeployState
  ): Promise<void> {
    // Do a check to make sure that the link target path is not outside the source folder
    const { sourceRootFolder } = options;
    const linkTargetPath: string = path.relative(sourceRootFolder, originalLinkInfo.targetPath);
    if (linkTargetPath.startsWith('..')) {
      throw new Error(
        `Symlink targets not under source folder "${sourceRootFolder}": ` +
          `${originalLinkInfo.linkPath} -> ${originalLinkInfo.targetPath}`
      );
    }

    const linkInfo: ILinkInfo = {
      kind: originalLinkInfo.kind,
      linkPath: this._remapPathForDeployFolder(originalLinkInfo.linkPath, options),
      targetPath: this._remapPathForDeployFolder(originalLinkInfo.targetPath, options)
    };

    const newLinkFolder: string = path.dirname(linkInfo.linkPath);
    await FileSystem.ensureFolderAsync(newLinkFolder);

    // Link to the relative path for symlinks
    const relativeTargetPath: string = path.relative(newLinkFolder, linkInfo.targetPath);

    // NOTE: This logic is based on NpmLinkManager._createSymlink()
    if (linkInfo.kind === 'fileLink') {
      // For files, we use a Windows "hard link", because creating a symbolic link requires
      // administrator permission. However hard links seem to cause build failures on Mac,
      // so for all other operating systems we use symbolic links for this case.
      if (process.platform === 'win32') {
        await FileSystem.createHardLinkAsync({
          linkTargetPath: relativeTargetPath,
          newLinkPath: linkInfo.linkPath
        });
      } else {
        await FileSystem.createSymbolicLinkFileAsync({
          linkTargetPath: relativeTargetPath,
          newLinkPath: linkInfo.linkPath
        });
      }
    } else {
      // Junctions are only supported on Windows. This will create a symbolic link on other platforms.
      await FileSystem.createSymbolicLinkJunctionAsync({
        linkTargetPath: relativeTargetPath,
        newLinkPath: linkInfo.linkPath
      });
    }

    // Since the created symlinks have the required relative paths, they can be added directly to
    // the archive.
    await state.archiver?.addToArchiveAsync({
      filePath: linkInfo.linkPath,
      archivePath: path.relative(options.targetRootFolder, linkInfo.linkPath)
    });
  }

  /**
   * Write the common/deploy/deploy-metadata.json file.
   */
  private async _writeDeployMetadataAsync(options: IDeployOptions, state: IDeployState): Promise<void> {
    const { mainProjectName, scenarioName, targetRootFolder } = options;
    const { projectConfigurationsByPath } = state;

    const deployMetadataFileName: string = 'deploy-metadata.json';
    const deployMetadataFilePath: string = path.join(targetRootFolder, deployMetadataFileName);
    const deployMetadataJson: IDeployMetadataJson = {
      mainProjectName,
      scenarioName,
      projects: [],
      links: []
    };

    for (const projectFolder of projectConfigurationsByPath.keys()) {
      deployMetadataJson.projects.push({
        path: this._remapPathForDeployMetadata(projectFolder, options)
      });
    }

    // Remap the links to be relative to target folder
    for (const absoluteLinkInfo of state.symlinkAnalyzer.reportSymlinks()) {
      const relativeInfo: ILinkInfo = {
        kind: absoluteLinkInfo.kind,
        linkPath: this._remapPathForDeployMetadata(absoluteLinkInfo.linkPath, options),
        targetPath: this._remapPathForDeployMetadata(absoluteLinkInfo.targetPath, options)
      };
      deployMetadataJson.links.push(relativeInfo);
    }

    const deployMetadataFileContent: string = JSON.stringify(deployMetadataJson, undefined, 0);
    if (!options.createArchiveOnly) {
      await FileSystem.writeFileAsync(deployMetadataFilePath, deployMetadataFileContent);
    }
    await state.archiver?.addToArchiveAsync({
      fileData: deployMetadataFileContent,
      archivePath: deployMetadataFileName
    });
  }

  private async _makeBinLinksAsync(
    projectFolder: string,
    options: IDeployOptions,
    state: IDeployState
  ): Promise<void> {
    const { terminal } = options;

    const deployedProjectFolder: string = this._remapPathForDeployFolder(projectFolder, options);
    const deployedProjectNodeModulesFolder: string = path.join(deployedProjectFolder, 'node_modules');
    const deployedProjectBinFolder: string = path.join(deployedProjectNodeModulesFolder, '.bin');

    await pnpmLinkBins(deployedProjectNodeModulesFolder, deployedProjectBinFolder, {
      warn: (msg: string) => terminal.writeLine(Colors.yellow(msg))
    });

    if (state.archiver) {
      const binFolderItems: string[] = await FileSystem.readFolderItemNamesAsync(deployedProjectBinFolder);
      for (const binFolderItem of binFolderItems) {
        const binFilePath: string = path.join(deployedProjectBinFolder, binFolderItem);
        await state.archiver.addToArchiveAsync({
          filePath: binFilePath,
          archivePath: path.relative(options.targetRootFolder, binFilePath)
        });
      }
    }
  }
}
