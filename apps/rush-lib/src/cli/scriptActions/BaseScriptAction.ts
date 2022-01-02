// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CommandLineParameter } from '@rushstack/ts-command-line';
import { BaseRushAction, IBaseRushActionOptions } from '../actions/BaseRushAction';
import { Command, CommandLineConfiguration } from '../../api/CommandLineConfiguration';
import { RushConstants } from '../../logic/RushConstants';
import type { ParameterJson } from '../../api/CommandLineJson';

/**
 * Constructor parameters for BaseScriptAction
 */
export interface IBaseScriptActionOptions<TCommand extends Command> extends IBaseRushActionOptions {
  commandLineConfiguration: CommandLineConfiguration;
  command: TCommand;
}

/**
 * Base class for command-line actions that are implemented using user-defined scripts.
 *
 * @remarks
 * Compared to the normal built-in actions, these actions are special because (1) they
 * can be discovered dynamically via common/config/command-line.json, and (2)
 * user-defined command-line parameters can be passed through to the script.
 *
 * The two subclasses are BulkScriptAction and GlobalScriptAction.
 */
export abstract class BaseScriptAction<TCommand extends Command> extends BaseRushAction {
  protected readonly commandLineConfiguration: CommandLineConfiguration;
  protected readonly customParameters: CommandLineParameter[] = [];
  protected readonly customParametersToPassToScript: CommandLineParameter[] = [];
  protected readonly command: TCommand;

  public constructor(options: IBaseScriptActionOptions<TCommand>) {
    super(options);
    this.commandLineConfiguration = options.commandLineConfiguration;
    this.command = options.command;
  }

  protected defineScriptParameters(): void {
    if (!this.commandLineConfiguration) {
      return;
    }

    // Find any parameters that are associated with this command
    for (const parameter of this.command.associatedParameters) {
      let customParameter: CommandLineParameter | undefined;
      let shouldIncludeInScript: boolean = true;

      switch (parameter.parameterKind) {
        case 'flag':
          customParameter = this.defineFlagParameter({
            parameterShortName: parameter.shortName,
            parameterLongName: parameter.longName,
            description: parameter.description,
            required: parameter.required
          });
          shouldIncludeInScript = !parameter.doNotIncludeInProjectCommandLine;
          break;
        case 'choice':
          customParameter = this.defineChoiceParameter({
            parameterShortName: parameter.shortName,
            parameterLongName: parameter.longName,
            description: parameter.description,
            required: parameter.required,
            alternatives: parameter.alternatives.map((x) => x.name),
            defaultValue: parameter.defaultValue
          });
          break;
        case 'string':
          customParameter = this.defineStringParameter({
            parameterLongName: parameter.longName,
            parameterShortName: parameter.shortName,
            description: parameter.description,
            required: parameter.required,
            argumentName: parameter.argumentName
          });
          break;
        default:
          throw new Error(
            `${RushConstants.commandLineFilename} defines a parameter "${
              (parameter as ParameterJson).longName
            }" using an unsupported parameter kind "${(parameter as ParameterJson).parameterKind}"`
          );
      }

      this.customParameters.push(customParameter);
      if (shouldIncludeInScript) {
        this.customParametersToPassToScript.push(customParameter);
      }
    }
  }
}
