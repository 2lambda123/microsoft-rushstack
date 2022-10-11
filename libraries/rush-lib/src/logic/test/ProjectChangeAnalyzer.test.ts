// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { StringBufferTerminalProvider, Terminal } from '@rushstack/node-core-library';

import { IProjectFileFilter, ProjectChangeAnalyzer } from '../ProjectChangeAnalyzer';
import { RushConfiguration } from '../../api/RushConfiguration';
import { EnvironmentConfiguration } from '../../api/EnvironmentConfiguration';
import { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { RushProjectConfiguration } from '../../api/RushProjectConfiguration';
import { LookupByPath } from '../LookupByPath';

describe(ProjectChangeAnalyzer.name, () => {
  beforeEach(() => {
    jest.spyOn(EnvironmentConfiguration, 'gitBinaryPath', 'get').mockReturnValue(undefined);
    jest.spyOn(RushProjectConfiguration, 'tryLoadIgnoreGlobsForProjectAsync').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  function createTestSubject(
    projects: RushConfigurationProject[],
    files: Map<string, string>
  ): ProjectChangeAnalyzer {
    const rushConfiguration: RushConfiguration = {
      commonRushConfigFolder: '',
      projects,
      rushJsonFolder: '',
      getCommittedShrinkwrapFilename(): string {
        return 'common/config/rush/pnpm-lock.yaml';
      },
      getProjectLookupForRoot(root: string): LookupByPath<RushConfigurationProject> {
        const lookup: LookupByPath<RushConfigurationProject> = new LookupByPath();
        for (const project of projects) {
          lookup.setItem(project.projectRelativeFolder, project);
        }
        return lookup;
      },
      getProjectByName(name: string): RushConfigurationProject | undefined {
        return projects.find((project) => project.packageName === name);
      }
    } as RushConfiguration;

    const subject: ProjectChangeAnalyzer = new ProjectChangeAnalyzer(rushConfiguration);

    subject['_getRepoDeps'] = jest.fn(() => {
      return {
        gitPath: 'git',
        hashes: files,
        rootDir: ''
      };
    });

    return subject;
  }

  describe(ProjectChangeAnalyzer.prototype._tryGetProjectDependencies.name, () => {
    it('returns the files for the specified project', async () => {
      const projects: RushConfigurationProject[] = [
        {
          packageName: 'apple',
          projectFolder: 'apps/apple',
          projectRelativeFolder: 'apps/apple'
        } as RushConfigurationProject,
        {
          packageName: 'banana',
          projectFolder: 'apps/apple',
          projectRelativeFolder: 'apps/banana'
        } as RushConfigurationProject
      ];
      const files: Map<string, string> = new Map([
        ['apps/apple/core.js', 'a101'],
        ['apps/banana/peel.js', 'b201']
      ]);
      const subject: ProjectChangeAnalyzer = createTestSubject(projects, files);
      const terminal: Terminal = new Terminal(new StringBufferTerminalProvider());

      expect(subject._tryGetProjectDependencies(projects[0], terminal)).toEqual(
        new Map([['apps/apple/core.js', 'a101']])
      );
      expect(subject._tryGetProjectDependencies(projects[1], terminal)).toEqual(
        new Map([['apps/banana/peel.js', 'b201']])
      );
    });

    it('ignores files based on filter, relative to project folder', async () => {
      const appleRegex: RegExp = /^assets\/[^\/]+\.png$|(?:^|\/)[^\/]+\.js\.map$/;
      const appleFilter: IProjectFileFilter = (projectRelativePath: string) => {
        return !appleRegex.test(projectRelativePath);
      };

      const projects: RushConfigurationProject[] = [
        {
          packageName: 'apple',
          projectFolder: 'apps/apple',
          projectRelativeFolder: 'apps/apple'
        } as RushConfigurationProject,
        {
          packageName: 'banana',
          projectFolder: 'apps/apple',
          projectRelativeFolder: 'apps/banana'
        } as RushConfigurationProject
      ];
      const files: Map<string, string> = new Map([
        ['apps/apple/core.js', 'a101'],
        ['apps/apple/core.js.map', 'a102'],
        ['apps/apple/assets/one.jpg', 'a103'],
        ['apps/apple/assets/two.png', 'a104'],
        ['apps/banana/peel.js', 'b201'],
        ['apps/banana/peel.js.map', 'b202']
      ]);
      const subject: ProjectChangeAnalyzer = createTestSubject(projects, files);
      const terminal: Terminal = new Terminal(new StringBufferTerminalProvider());

      expect(subject._tryGetProjectDependencies(projects[0], terminal, appleFilter)).toEqual(
        new Map([
          ['apps/apple/core.js', 'a101'],
          ['apps/apple/assets/one.jpg', 'a103']
        ])
      );
      expect(subject._tryGetProjectDependencies(projects[1], terminal)).toEqual(
        new Map([
          ['apps/banana/peel.js', 'b201'],
          ['apps/banana/peel.js.map', 'b202']
        ])
      );
    });

    it('works with more complex filters', async () => {
      const appleRegex: RegExp = /^assets\/[^\/]+\.psd$|(?:^|\/)[^\/]+\.png$/;
      const appleFilter: IProjectFileFilter = (projectRelativePath: string) => {
        return projectRelativePath.startsWith('assets/important/') || !appleRegex.test(projectRelativePath);
      };

      const projects: RushConfigurationProject[] = [
        {
          packageName: 'apple',
          projectFolder: 'apps/apple',
          projectRelativeFolder: 'apps/apple'
        } as RushConfigurationProject
      ];
      const files: Map<string, string> = new Map([
        ['apps/apple/one.png', 'a101'],
        ['apps/apple/assets/two.psd', 'a102'],
        ['apps/apple/assets/three.png', 'a103'],
        ['apps/apple/assets/important/four.png', 'a104'],
        ['apps/apple/assets/important/five.psd', 'a105'],
        ['apps/apple/src/index.ts', 'a106']
      ]);
      const subject: ProjectChangeAnalyzer = createTestSubject(projects, files);
      const terminal: Terminal = new Terminal(new StringBufferTerminalProvider());

      // In a dot-ignore file, the later rule '!assets/important/**' should override the previous
      // rule of '*.png'. This unit test verifies that this behavior doesn't change later if
      // we modify the implementation.
      expect(subject._tryGetProjectDependencies(projects[0], terminal, appleFilter)).toEqual(
        new Map([
          ['apps/apple/assets/important/four.png', 'a104'],
          ['apps/apple/assets/important/five.psd', 'a105'],
          ['apps/apple/src/index.ts', 'a106']
        ])
      );
    });

    it('includes the committed shrinkwrap file as a dep for all projects', async () => {
      const projects: RushConfigurationProject[] = [
        {
          packageName: 'apple',
          projectFolder: 'apps/apple',
          projectRelativeFolder: 'apps/apple'
        } as RushConfigurationProject,
        {
          packageName: 'banana',
          projectFolder: 'apps/apple',
          projectRelativeFolder: 'apps/banana'
        } as RushConfigurationProject
      ];
      const files: Map<string, string> = new Map([
        ['apps/apple/core.js', 'a101'],
        ['apps/banana/peel.js', 'b201'],
        ['common/config/rush/pnpm-lock.yaml', 'ffff'],
        ['tools/random-file.js', 'e00e']
      ]);
      const subject: ProjectChangeAnalyzer = createTestSubject(projects, files);
      const terminal: Terminal = new Terminal(new StringBufferTerminalProvider());

      expect(subject._tryGetProjectDependencies(projects[0], terminal)).toEqual(
        new Map([
          ['apps/apple/core.js', 'a101'],
          ['common/config/rush/pnpm-lock.yaml', 'ffff']
        ])
      );
      expect(subject._tryGetProjectDependencies(projects[1], terminal)).toEqual(
        new Map([
          ['apps/banana/peel.js', 'b201'],
          ['common/config/rush/pnpm-lock.yaml', 'ffff']
        ])
      );
    });

    it('throws an exception if the specified project does not exist', async () => {
      const projects: RushConfigurationProject[] = [
        {
          packageName: 'apple',
          projectFolder: 'apps/apple',
          projectRelativeFolder: 'apps/apple'
        } as RushConfigurationProject
      ];
      const files: Map<string, string> = new Map([['apps/apple/core.js', 'a101']]);
      const subject: ProjectChangeAnalyzer = createTestSubject(projects, files);
      const terminal: Terminal = new Terminal(new StringBufferTerminalProvider());

      try {
        subject._tryGetProjectDependencies(
          {
            packageName: 'carrot'
          } as RushConfigurationProject,
          terminal
        );
        fail('Should have thrown error');
      } catch (e) {
        expect(e).toMatchSnapshot();
      }
    });

    it('lazy-loads project data and caches it for future calls', async () => {
      const projects: RushConfigurationProject[] = [
        {
          packageName: 'apple',
          projectFolder: 'apps/apple',
          projectRelativeFolder: 'apps/apple'
        } as RushConfigurationProject
      ];
      const files: Map<string, string> = new Map([['apps/apple/core.js', 'a101']]);
      const subject: ProjectChangeAnalyzer = createTestSubject(projects, files);
      const terminal: Terminal = new Terminal(new StringBufferTerminalProvider());

      // Because other unit tests rely on the fact that a freshly instantiated
      // ProjectChangeAnalyzer is inert until someone actually requests project data,
      // this test makes that expectation explicit.

      expect(subject['_data']).toEqual(undefined);
      const originalResult: ReadonlyMap<string, string> | undefined = subject._tryGetProjectDependencies(
        projects[0],
        terminal
      );
      expect(originalResult).toEqual(new Map([['apps/apple/core.js', 'a101']]));
      expect(subject['_data']).toBeDefined();
      expect(subject._tryGetProjectDependencies(projects[0], terminal)).toBe(originalResult);
      expect(subject['_getRepoDeps']).toHaveBeenCalledTimes(1);
    });
  });

  describe(ProjectChangeAnalyzer.prototype._tryGetProjectStateHash.name, () => {
    it('returns a fixed hash snapshot for a set of project deps', async () => {
      const projects: RushConfigurationProject[] = [
        {
          packageName: 'apple',
          projectFolder: 'apps/apple',
          projectRelativeFolder: 'apps/apple'
        } as RushConfigurationProject
      ];
      const files: Map<string, string> = new Map([
        ['apps/apple/core.js', 'a101'],
        ['apps/apple/juice.js', 'e333'],
        ['apps/apple/slices.js', 'a102']
      ]);
      const subject: ProjectChangeAnalyzer = createTestSubject(projects, files);
      const terminal: Terminal = new Terminal(new StringBufferTerminalProvider());

      expect(subject._tryGetProjectStateHash(projects[0], terminal)).toMatchInlineSnapshot(
        `"265536e325cdfac3fa806a51873d927a712fc6c9"`
      );
    });

    it('returns the same hash regardless of dep order', async () => {
      const projectsA: RushConfigurationProject[] = [
        {
          packageName: 'apple',
          projectFolder: '/apps/apple',
          projectRelativeFolder: 'apps/apple'
        } as RushConfigurationProject
      ];
      const filesA: Map<string, string> = new Map([
        ['apps/apple/core.js', 'a101'],
        ['apps/apple/juice.js', 'e333'],
        ['apps/apple/slices.js', 'a102']
      ]);
      const subjectA: ProjectChangeAnalyzer = createTestSubject(projectsA, filesA);

      const projectsB: RushConfigurationProject[] = [
        {
          packageName: 'apple',
          projectFolder: 'apps/apple',
          projectRelativeFolder: 'apps/apple'
        } as RushConfigurationProject
      ];
      const filesB: Map<string, string> = new Map([
        ['apps/apple/slices.js', 'a102'],
        ['apps/apple/core.js', 'a101'],
        ['apps/apple/juice.js', 'e333']
      ]);
      const subjectB: ProjectChangeAnalyzer = createTestSubject(projectsB, filesB);

      const terminal: Terminal = new Terminal(new StringBufferTerminalProvider());
      expect(subjectA._tryGetProjectStateHash(projectsA[0], terminal)).toEqual(
        subjectB._tryGetProjectStateHash(projectsB[0], terminal)
      );
    });
  });
});
