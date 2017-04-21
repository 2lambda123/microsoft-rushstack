// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as child_process from 'child_process';

/**
 * @public
 */
export default class VersionControl {
  public static getChangedFolders(targetBranch?: string): string[] {
    const branchName: string = targetBranch ? targetBranch : 'origin/master';
    const output: string = child_process.execSync(`git diff ${branchName}... --dirstat=files,0`)
      .toString();
    return output.split('\n').map(s => {
      if (s) {
        const delimiterIndex: number = s.indexOf('%');
        if (delimiterIndex > 0 && delimiterIndex + 1 < s.length) {
          return s.substring(delimiterIndex + 1).trim();
        }
      }
      return undefined;
    });
  }

  public static getChangedFiles(prefix?: string, targetBranch?: string): string[] {
    const branchName: string = targetBranch ? targetBranch : 'origin/master';
    const output: string = child_process
      .execSync(`git diff ${branchName}... --name-only --diff-filter=A`)
      .toString();
    const regex: RegExp = prefix ? new RegExp(`^${prefix}`, 'i') : undefined;
    return output.split('\n').map(s => {
      if (s) {
        const trimmedLine: string = s.trim();
        if (trimmedLine.match(regex)) {
          return trimmedLine;
        }
      }
      return undefined;
    }).filter(s => {
      return s && s.length > 0;
    });
  }

  public static hasUncommitedChanges(): boolean {
    return VersionControl._hasUntrackedChanges() || VersionControl._hasDiffOnHEAD();
  }

  /**
   * This lists files that have not been added/tracked in git.
   */
  private static _hasUntrackedChanges(): boolean {
    const output: string = child_process
      .execSync(`git ls-files --exclude-standard --others`)
      .toString();
    return output.trim().length > 0;
  }

  private static _hasDiffOnHEAD(): boolean {
    const output: string = child_process
      .execSync(`git diff HEAD --shortstat`)
      .toString();
    return output.trim().length > 0;
  }
}