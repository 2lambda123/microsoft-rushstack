// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { JsonFile } from '@microsoft/node-core-library';
import { IPackageJson } from '@microsoft/rush-lib';

/**
 * Represents a "@rush-temp" scoped package, which has our additional custom field
 * for tracking the dependency graph.
 */
export interface IRushTempPackageJson extends IPackageJson {
  /**
   * An extra setting written into package.json for temp packages, to track
   * references to locally built projects.
   */
  rushDependencies?: { [key: string]: string };
}

/**
 * Represents an NPM package being processed by the "rush link" algorithm.
 */
export default class Package {
  /**
   * The "name" field from package.json
   */
  public name: string;

  /**
   * The "version" field from package.json
   */
  public version: string;

  /**
   * The absolute path to the folder that contains package.json.
   */
  public folderPath: string;

  /**
   * The parent package, or undefined if this is the root of the tree.
   */
  public parent: Package | undefined;

  public packageJson: IRushTempPackageJson | undefined;

  /**
   * If this is a local path that we are planning to symlink to a target folder,
   * then symlinkTargetFolderPath keeps track of the intended target.
   */
  public symlinkTargetFolderPath: string | undefined = undefined;

   /**
   * Packages that were placed in node_modules subfolders of this package.
   * The child packages are not necessarily dependencies of this package.
   */
  public children: Package[];
  private _childrenByName: Map<string, Package>;

  /**
   * Used by "npm link" when creating a Package object that represents symbolic links to be created.
   */
  public static createLinkedPackage(name: string,
    version: string,
    folderPath: string,
    packageJson?: IRushTempPackageJson): Package {
    return new Package(name, version, folderPath, packageJson);
  }

  /**
   * Used by "npm link" to simulate a temp project that is missing from the common/node_modules
   * folder (e.g. because it was added after the shrinkwrap file was regenerated).
   * @param packageJsonFilename - Filename of the source package.json
   *        Example: c:\MyRepo\common\temp\projects\project1\package.json
   * @param targetFolderName - Filename where it should have been installed
   *        Example: c:\MyRepo\common\temp\node_modules\@rush-temp\project1
   */
  public static createVirtualTempPackage(packageJsonFilename: string, installFolderName: string): Package {
    const packageJson: IRushTempPackageJson = JsonFile.load(packageJsonFilename);
    return Package.createLinkedPackage(packageJson.name, packageJson.version, installFolderName, packageJson);
  }

  public get nameAndVersion(): string {
    let result: string = '';

    if (this.name) {
      result += this.name;
    } else {
      result += '(missing name)';
    }
    result += '@';
    if (this.version) {
      result += this.version;
    } else {
      result += '(missing version)';
    }
    return result;
  }

  public addChild(child: Package): void {
    if (child.parent) {
      throw Error('Child already has a parent');
    }
    if (this._childrenByName.has(child.name)) {
      throw Error('Child already exists');
    }
    child.parent = this;
    this.children.push(child);
    this._childrenByName.set(child.name, child);
  }

  public getChildByName(childPackageName: string): Package | undefined {
    return this._childrenByName.get(childPackageName);
  }

  public printTree(indent?: string): void {
    if (!indent) {
      indent = '';
    }
    console.log(indent + this.nameAndVersion);
    for (const child of this.children) {
      child.printTree(indent + '  ');
    }
  }

  private constructor(name: string,
    version: string,
    folderPath: string,
    packageJson: IRushTempPackageJson | undefined) {

    this.name = name;
    this.packageJson = packageJson;
    this.version = version;
    this.folderPath = folderPath;

    this.children = [];
    this._childrenByName = new Map<string, Package>();
  }
}
