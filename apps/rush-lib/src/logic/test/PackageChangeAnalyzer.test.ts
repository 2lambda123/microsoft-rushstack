// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';

import { PackageChangeAnalyzer } from '../PackageChangeAnalyzer';
import { RushConfiguration } from '../../api/RushConfiguration';
import { EnvironmentConfiguration } from '../../api/EnvironmentConfiguration';
import { LookupByPath } from '../LookupByPath';
import { RushConfigurationProject } from '../../api/RushConfigurationProject';

const packageA: string = 'project-a';
// Git will always return paths with '/' as the delimiter
const packageAPath: string = path.posix.join('tools', packageA);
const fileA: string = path.posix.join(packageAPath, 'src/index.ts');
// const packageB: string = 'project-b';
// const packageBPath: string = path.join('tools', packageB);
// const fileB: string = path.join(packageBPath, 'src/index.ts');
// const packageBPath: string = path.join('tools', packageB);
const HASH: string = '12345abcdef';
// const looseFile: string = 'some/other/folder/index.ts';

describe('PackageChangeAnalyzer', () => {
  beforeEach(() => {
    jest.spyOn(EnvironmentConfiguration, 'gitBinaryPath', 'get').mockReturnValue(undefined);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('can associate a file in a project folder with a project', () => {
    const repoHashDeps: Map<string, string> = new Map<string, string>([
      [fileA, HASH],
      [path.posix.join('common', 'config', 'rush', 'pnpm-lock.yaml'), HASH]
    ]);

    const project: RushConfigurationProject = {
      packageName: packageA,
      projectRelativeFolder: packageAPath
    } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    const pathTree: LookupByPath<RushConfigurationProject> = new LookupByPath([
      [packageAPath.replace(/\\/g, '/'), project]
    ]);

    PackageChangeAnalyzer.getPackageDeps = () => repoHashDeps;
    const rushConfiguration: RushConfiguration = {
      commonRushConfigFolder: '',
      projects: [project],
      rushJsonFolder: '',
      getCommittedShrinkwrapFilename(): string {
        return 'common/config/rush/pnpm-lock.yaml';
      },
      findProjectForPosixRelativePath(path: string): object | undefined {
        return pathTree.findChildPath(path);
      }
    } as any; // eslint-disable-line @typescript-eslint/no-explicit-any

    const packageChangeAnalyzer: PackageChangeAnalyzer = new PackageChangeAnalyzer(rushConfiguration);
    const packageDeps: Map<string, string> | undefined = packageChangeAnalyzer.getPackageDeps(packageA);
    expect(packageDeps).toEqual(repoHashDeps);
  });

  /*
  it('associates a file that is not in a project with all projects', () => {
    const repoHashDeps: IPackageDeps = {
      files: {
        [looseFile]: HASH,
        [fileA]: HASH,
        [fileB]: HASH
      }
    };

    PackageChangeAnalyzer.getPackageDeps = (path: string, ignored: string[]) => repoHashDeps;
    PackageChangeAnalyzer.rushConfig = {
      projects: [{
        packageName: packageA,
        projectRelativeFolder: packageAPath
      },
      {
        packageName: packageB,
        projectRelativeFolder: packageBPath
      }]
    } as any; // eslint-disable-line @typescript-eslint/no-explicit-any

    let packageDeps: IPackageDeps = PackageChangeAnalyzer.instance.getPackageDepsHash(packageA);
    expect(packageDeps).toEqual({
      files: {
        [looseFile]: HASH,
        [fileA]: HASH
      }
    });

    packageDeps = PackageChangeAnalyzer.instance.getPackageDepsHash(packageB);
    expect(packageDeps).toEqual({
      files: {
        [looseFile]: HASH,
        [fileB]: HASH
      }
    });
  });
  */
});
