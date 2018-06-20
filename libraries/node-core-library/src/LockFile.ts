// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fsx from 'fs-extra';
import * as path from 'path';
import * as child_process from 'child_process';
import { setTimeout } from 'timers';

/**
 * Parses the process start time from a linux /proc/1/stat file.
 * @param stat The contents of a linux /proc/1/stat file.
 * @returns The process start time in yiffies.
 */
export function getProcessStartTimeFromProcStat (stat: string): string | undefined {
  // Parse value 22.
  // We cannot just split stat on spaces, because value 2 may contain spaces.
  // For example, when running the following Shell commands:
  // > cp "$(which bash)" ./'bash 2)('
  // > ./'bash 2)(' -c 'OWNPID=$BASHPID;cat /proc/$OWNPID/stat'
  // 59389 (bash 2)() S 59358 59389 59358 34818 59389 4202496 329 0 0 0 0 0 0 0 20 0 1 0
  // > rm -rf ./'bash 2)('
  // The output shows a stat file such that value 2 contains spaces.
  // To still umambiguously parse such output we assume all values after the third consist of only digits...

  // trimRight to remove the trailing line terminator.
  let values: string[] = stat.trimRight().split(' ');
  let i: number = values.length - 1;
  while (i >= 0 && /^[0-9]+$/.test(values[i])) {
    i -= 1;
  }
  // i is the index of the third value (but i need not be 2).
  if (i < 2) {
    // Format of stat has changed.
    return undefined;
  }
  const value2: string = values.slice(1, i - 1).join(' ');
  values = [values[0], value2].concat(values.slice(i));
  if (values.length < 22) {
    // Older version of linux, or non-standard configuration of linux.
    return undefined;
  }
  const startTimeYiffies: string = values[21];
  // In theory, the representations of start time returned by /proc/*/stat and ps -o lstart can change while the
  // system is running, but we assume this does not happen.
  // So the caller can safely use this value as part of a unique process id (on the machine, without comparing
  // accross reboots).
  return startTimeYiffies;
}

/**
 * Helper function that is exported for unit tests only.
 * Returns undefined if the process doesn't exist with that pid.
 */
export function getProcessStartTime(pid: number): string | undefined {
  // Use toFixed() to ensure decimal representation is used when converting the PID to string, although no PID is
  // large enough to be printed using exponential notation.
  const pidString: string = pid.toFixed();
  let args: string[];
  if (process.platform === 'darwin') {
    args = [`-p ${pidString}`, '-o lstart'];
  } else if (process.platform === 'linux') {
    args = ['-p', pidString, '-o', 'lstart'];
  } else {
    throw new Error(`Unsupported system: ${process.platform}`);
  }

  const psResult: child_process.SpawnSyncReturns<string> = child_process.spawnSync('ps', args, {
    encoding: 'utf8'
  });
  const psStdout: string = psResult.stdout;

  // If no process with PID pid exists then the exit code is non-zero on linux.
  // But if no process exists we do not want to fall back on /proc/*/stat to determine the process
  // start time, so we we additionally add !psStdout.
  if (psResult.status !== 0 && !psStdout && process.platform === 'linux') {
    // Try to read /proc/${pidString}/stat and get the value 22.
    // This is the start time of the process with PID pid, in jiffies.
    // Sources:
    // http://man7.org/linux/man-pages/man5/proc.5.html
    // https://unix.stackexchange.com/questions/62154/when-was-a-process-started/#answer-62156
    let stat: undefined|string;
    try {
      stat = fsx.readFileSync(`/proc/${pidString}/stat`, 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      // Either no process with PID pid exists, or this version/configuration of linux is non-standard.
      // We assume the former.
      return undefined;
    }
    if (stat !== undefined) {
      const startTimeYiffies: string|undefined = getProcessStartTimeFromProcStat(stat);
      if (startTimeYiffies === undefined) {
        throw new Error(`Could not retrieve the start time of process ${pidString} from the OS because the `
          + `contents of /proc/${pidString}/stat have an unexpected format`);
      }
      return startTimeYiffies;
    }
  }

  // there was an error executing ps
  if (!psStdout) {
    throw new Error(`Unexpected output from "ps" command`);
  }

  const psSplit: string[] = psStdout.split('\n');

  // successfuly able to run "ps", but no process was found
  if (psSplit[1] === '') {
    return undefined;
  }

  if (psSplit[1]) {
    const trimmed: string = psSplit[1].trim();
    if (trimmed.length > 10) {
      return trimmed;
    }
  }

  throw new Error(`Unexpected output from the "ps" command`);
}

/**
 * A helper utility for working with file-based locks.
 * This class should only be used for locking resources across processes,
 * but should not be used for attempting to lock a resource in the same process.
 * @public
 */
export class LockFile {
  private static _getStartTime: (pid: number) => string | undefined = getProcessStartTime;

  /**
   * Returns the path to the lockfile, should it be created successfully.
   */
  public static getLockFilePath(resourceDir: string, resourceName: string, pid: number = process.pid): string {
    if (!resourceName.match(/^[a-zA-Z0-9][a-zA-Z0-9-.]+[a-zA-Z0-9]$/)) {
      throw new Error(`The resource name "${resourceName}" is invalid.`
        + ` It must be an alphanumberic string with only "-" or "." It must start with an alphanumeric character.`);
    }

    if (process.platform === 'win32') {
      return path.join(path.resolve(resourceDir), `${resourceName}.lock`);
    } else if (process.platform === 'linux' || process.platform === 'darwin') {
      return path.join(path.resolve(resourceDir), `${resourceName}#${pid}.lock`);
    }

    throw new Error(`File locking not implemented for platform: "${process.platform}"`);
  }

  /**
   * Attempts to create a lockfile with the given filePath.
   * If successful, returns a LockFile instance.
   * If unable to get a lock, returns undefined.
   * @param resourceName - the name of the resource we are locking on. Should be an alphabetic string.
   */
  public static tryAcquire(resourceDir: string, resourceName: string): LockFile | undefined {
    fsx.mkdirsSync(resourceDir);
    if (process.platform === 'win32') {
      return LockFile._tryAcquireWindows(resourceDir, resourceName);
    } else if (process.platform === 'linux' || process.platform === 'darwin') {
      return LockFile._tryAcquireMacOrLinux(resourceDir, resourceName);
    }
    throw new Error(`File locking not implemented for platform: "${process.platform}"`);
  }

  /**
   * Attempts to create the lockfile.
   * Will continue to loop at every 100ms until the lock becomes available or the maxWaitMs is surpassed.
   * @remarks This function is subject to starvation, whereby it does not ensure that the process that has been
   *          waiting the longest to acquire the lock will get it first. This means that a process could theoretically
   *          wait for the lock forever, while other processes skipped it in line and acquired the lock first.
   */
  public static acquire(resourceDir: string, resourceName: string, maxWaitMs?: number): Promise<LockFile> {
    const interval: number = 100;
    const startTime: number = Date.now();

    const retryLoop: () => Promise<LockFile> = () => {
      const lock: LockFile | undefined = LockFile.tryAcquire(resourceDir, resourceName);
      if (lock) {
        return Promise.resolve(lock);
      }
      if (maxWaitMs && (Date.now() > startTime + maxWaitMs)) {
        return Promise.reject(new Error(`Exceeded maximum wait time to acquire lock for resource "${resourceName}"`));
      }

      return LockFile._sleepForMs(interval).then(() => {
        return retryLoop();
      });
    };

    return retryLoop();
  }

  private static _sleepForMs(timeout: number): Promise<void> {
    return new Promise<void>((resolve: () => void, reject: () => void) => {
      setTimeout(() => {
        resolve();
      }, timeout);
    });
  }

  /**
   * Attempts to acquire the lock on a Linux or OSX machine
   */
  private static _tryAcquireMacOrLinux(resourceDir: string, resourceName: string): LockFile | undefined {
    let dirtyWhenAcquired: boolean = false;

    // get the current process' pid
    const pid: number = process.pid;
    const startTime: string | undefined = LockFile._getStartTime(pid);

    if (!startTime) {
      throw new Error(`Unable to calculate start time for current process.`);
    }

    const pidLockFilePath: string = LockFile.getLockFilePath(resourceDir, resourceName);
    let lockFileDescriptor: number | undefined;

    let lockFile: LockFile;

    try {
      // open in write mode since if this file exists, it cannot be from the current process
      // TODO: This will malfunction if the same process tries to acquire two locks on the same file.
      // We should ideally maintain a dictionary of normalized acquired filenames
      lockFileDescriptor = fsx.openSync(pidLockFilePath, 'w');
      fsx.writeSync(lockFileDescriptor, startTime);

      const currentBirthTimeMs: number = fsx.statSync(pidLockFilePath).birthtime.getTime();

      let smallestBirthTimeMs: number = currentBirthTimeMs;
      let smallestBirthTimePid: string = pid.toString();

      // now, scan the directory for all lockfiles
      const files: string[] = fsx.readdirSync(resourceDir);

      // look for anything ending with # then numbers and ".lock"
      const lockFileRegExp: RegExp = /^(.+)#([0-9]+)\.lock$/;

      let match: RegExpMatchArray | null;
      let otherPid: string;
      for (const fileInFolder of files) {
        if ((match = fileInFolder.match(lockFileRegExp))
          && (match[1] === resourceName)
          && ((otherPid = match[2]) !== pid.toString())) {

          // we found at least one lockfile hanging around that isn't ours
          const fileInFolderPath: string = path.join(resourceDir, fileInFolder);
          dirtyWhenAcquired = true;

          // console.log(`FOUND OTHER LOCKFILE: ${otherPid}`);

          const otherPidCurrentStartTime: string | undefined = LockFile._getStartTime(parseInt(otherPid, 10));

          let otherPidOldStartTime: string | undefined;
          let otherBirthtimeMs: number | undefined;
          try {
            otherPidOldStartTime = fsx.readFileSync(fileInFolderPath, 'utf8');
            // check the timestamp of the file
            otherBirthtimeMs = fsx.statSync(fileInFolderPath).birthtime.getTime();
          } catch (err) {
            // this means the file is probably deleted already
          }

          // if the otherPidOldStartTime is invalid, then we should look at the timestamp,
          // if this file was created after us, ignore it
          // if it was created within 1 second before us, then it could be good, so we
          //  will conservatively fail
          // otherwise it is an old lock file and will be deleted
          if (otherPidOldStartTime === '' && otherBirthtimeMs !== undefined) {
            if (otherBirthtimeMs > currentBirthTimeMs) {
              // ignore this file, he will be unable to get the lock since this process
              // will hold it
              // console.log(`Ignoring lock for pid ${otherPid} because its lockfile is newer than ours.`);
              continue;
            } else if (otherBirthtimeMs - currentBirthTimeMs < 0        // it was created before us AND
              && otherBirthtimeMs - currentBirthTimeMs > -1000) { // it was created less than a second before

              // conservatively be unable to keep the lock
              return undefined;
            }
          }

          // console.log(`Other pid ${otherPid} lockfile has start time: "${otherPidOldStartTime}"`);
          // console.log(`Other pid ${otherPid} actually has start time: "${otherPidCurrentStartTime}"`);

          // this means the process is no longer executing, delete the file
          if (!otherPidCurrentStartTime || otherPidOldStartTime !== otherPidCurrentStartTime) {
            // console.log(`Other pid ${otherPid} is no longer executing!`);
            fsx.removeSync(fileInFolderPath);
            continue;
          }

          // console.log(`Pid ${otherPid} lockfile has birth time: ${otherBirthtimeMs}`);
          // console.log(`Pid ${pid} lockfile has birth time: ${currentBirthTimeMs}`);
          // this is a lockfile pointing at something valid
          if (otherBirthtimeMs !== undefined && otherBirthtimeMs < smallestBirthTimeMs) {
            smallestBirthTimeMs = otherBirthtimeMs;
            smallestBirthTimePid = otherPid;
          }
        }
      }

      if (smallestBirthTimePid !== pid.toString()) {
        // we do not have the lock
        return undefined;
      }

      // we have the lock!
      lockFile = new LockFile(lockFileDescriptor, pidLockFilePath, dirtyWhenAcquired);
      lockFileDescriptor = undefined; // we have handed the descriptor off to the instance
    } finally {
      if (lockFileDescriptor) {
        // ensure our lock is closed
        fsx.closeSync(lockFileDescriptor);
        fsx.removeSync(pidLockFilePath);
      }
    }
    return lockFile;
  }

  /**
   * Attempts to acquire the lock using Windows
   * This algorithm is much simpler since we can rely on the operating system
   */
  private static _tryAcquireWindows(resourceDir: string, resourceName: string): LockFile | undefined {
    const lockFilePath: string = LockFile.getLockFilePath(resourceDir, resourceName);
    let dirtyWhenAcquired: boolean = false;

    let fileDescriptor: number | undefined;
    let lockFile: LockFile;

    try {
      if (fsx.existsSync(lockFilePath)) {
        dirtyWhenAcquired = true;

        // If the lockfile is held by an process with an exclusive lock, then removing it will
        // silently fail. OpenSync() below will then fail and we will be unable to create a lock.

        // Otherwise, the lockfile is sitting on disk, but nothing is holding it, implying that
        // the last process to hold it died.
        fsx.unlinkSync(lockFilePath);
      }

      try {
        // Attempt to open an exclusive lockfile
        fileDescriptor = fsx.openSync(lockFilePath, 'wx');
      } catch (error) {
        // we tried to delete the lock, but something else is holding it,
        // (probably an active process), therefore we are unable to create a lock
        return undefined;
      }

      // Ensure we can hand off the file descriptor to the lockfile
      lockFile = new LockFile(fileDescriptor, lockFilePath, dirtyWhenAcquired);
      fileDescriptor = undefined;
    } finally {
      if (fileDescriptor) {
        fsx.closeSync(fileDescriptor);
      }
    }

    return lockFile;
  }

  /**
   * Unlocks a file and removes it from disk.
   * This can only be called once.
   */
  public release(): void {
    if (this.isReleased) {
      throw new Error(`The lock for file "${path.basename(this._filePath)}" has already been released.`);
    }

    fsx.closeSync(this._fileDescriptor!);
    fsx.removeSync(this._filePath);
    this._fileDescriptor = undefined;
  }

  /**
   * Returns the initial state of the lock.
   * This can be used to detect if the previous process was terminated before releasing the resource.
   */
  public get dirtyWhenAcquired(): boolean {
    return this._dirtyWhenAcquired;
  }

  /**
   * Returns the absolute path to the lockfile
   */
  public get filePath(): string {
    return this._filePath;
  }

  /**
   * Returns true if this lock is currently being held.
   */
  public get isReleased(): boolean {
    return this._fileDescriptor === undefined;
  }

  private constructor(
    private _fileDescriptor: number | undefined,
    private _filePath: string,
    private _dirtyWhenAcquired: boolean) {
  }
}