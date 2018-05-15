// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import * as wordwrap from 'wordwrap';

import { Logging } from '@microsoft/node-core-library';

import { RushConstants } from '../../RushConstants';
import { Utilities } from '../../utilities/Utilities';

export class CommandLineMigrationAdvisor {

  // NOTE: THIS RUNS BEFORE THE REAL COMMAND-LINE PARSING.
  // TAKE EXTREME CARE THAT THE HEURISTICS CANNOT FALSELY MATCH A VALID COMMAND LINE.
  public static checkArgv(argv: string[]): boolean {
    // 0=node.exe, 1=script name
    const args: string[] = process.argv.slice(2);

    if (args.length > 0) {

      if (args[0] === 'generate') {
        CommandLineMigrationAdvisor._reportDeprecated(
          'Instead of "rush generate", use "rush update" or "rush update --full".');
        return false;
      }

      if (args[0] === 'install') {
        if (args.indexOf('-C') >= 0  || args.indexOf('--full-clean') >= 0) {
          CommandLineMigrationAdvisor._reportDeprecated(
            'Instead of "rush install --full-clean", use "rush purge --unsafe".');
          return false;
        }
        if (args.indexOf('-c') >= 0  || args.indexOf('--clean') >= 0) {
          CommandLineMigrationAdvisor._reportDeprecated(
            'Instead of "rush install --clean", use "rush install --purge".');
          return false;
        }
      }
    }

    // Everything is okay
    return true;
  }

  private static _reportDeprecated(message: string): void {
    const wrap: (textToWrap: string) => string = wordwrap.soft(Utilities.getConsoleWidth());

    Logging.error(colors.red(wrap(
     'ERROR: You specified an outdated command-line that is no longer supported by this version of Rush:'
    )));
    Logging.error(colors.yellow(wrap(message)));
    Logging.error();
    Logging.error(wrap(`For command-line help, type "rush -h".  For migration instructions,`
      + ` please visit ${RushConstants.rushWebSiteUrl}`));
  }

}
