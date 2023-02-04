// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ITerminal } from '@rushstack/node-core-library';

import { IScopedLogger } from '@rushstack/heft';
import {
  ISubprocessRunnerBaseConfiguration,
  SubprocessRunnerBase
} from '@rushstack/heft/lib/utilities/subprocess/SubprocessRunnerBase';

export interface IStorybookRunnerConfiguration extends ISubprocessRunnerBaseConfiguration {
  resolvedStartupModulePath: string;
  staticBuildOutputFolder?: string;
}

// TODO: Why must this be a different name from the logger in StorybookPlugin.ts?
const TASK_NAME: string = 'heft-storybook-runnner';

export class StorybookRunner extends SubprocessRunnerBase<IStorybookRunnerConfiguration> {
  private _logger!: IScopedLogger;

  public get filename(): string {
    return __filename;
  }

  public async invokeAsync(): Promise<void> {
    this._logger = await this.requestScopedLoggerAsync(TASK_NAME);
    const terminal: ITerminal = this._logger.terminal;

    terminal.writeLine('Launching ' + this._configuration.resolvedStartupModulePath);

    if (this._configuration.staticBuildOutputFolder) {
      const originalArgv: string[] = process.argv;
      process.argv.push(`--output-dir=${this._configuration.staticBuildOutputFolder}`);
      process.argv = originalArgv;
    }

    require(this._configuration.resolvedStartupModulePath);

    terminal.writeVerboseLine('Completed synchronous portion of launching startupModulePath');
  }
}
