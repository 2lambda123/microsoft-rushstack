// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { GulpTask } from '@microsoft/gulp-core-build';
import gulpType = require('gulp');

export interface ITextTaskConfig {
  /**
   * Glob matches for files that should be converted into modules.
   */
  textMatch?: string[];
}

export class TextTask extends GulpTask<ITextTaskConfig> {
  constructor() {
    super(
      'text',
      {
        textMatch: ['src/**/*.txt']
      }
    );
  }

  public executeTask(gulp: gulpType.Gulp): NodeJS.ReadWriteStream | void {
    /* tslint:disable:typedef */
    const merge = require('merge2');
    const texttojs = require('gulp-texttojs');
    const { textMatch } = this.taskConfig;
    const { libFolder, libAMDFolder } = this.buildConfig;
    /* tslint:enable:typedef */

    if (textMatch) {
      const commonJSTextStream: NodeJS.ReadWriteStream = gulp.src(textMatch)
        .pipe(texttojs({
          template: 'module.exports = <%= content %>;'
        }))
        .pipe(gulp.dest(libFolder));

      if (libAMDFolder) {
        return merge(
          commonJSTextStream,
          gulp.src(textMatch)
            .pipe(texttojs())
            .pipe(gulp.dest(libAMDFolder))
        );
      } else {
        return commonJSTextStream;
      }
    }
  }
}
