'use strict';

let fs = require('fs');
let os = require('os');
let path = require('path');
let semver = require('semver');
let deleteFile = require('./utils').deleteFile;
let forEachPackage = require('./enumerate').forEachPackage;
let getAllProjects = require('./enumerate').getAllProjects;

let _downstreamDeps = getDownstreamDependencies();
let _allPackages = getAllProjects();
let _changeTypes = {
  major: 3,
  minor: 2,
  patch: 1,
  dependency: 0,
  3: 'major',
  2: 'minor',
  1: 'patch',
  0: 'dependency'
};

let _shouldCommit = process.argv.indexOf('--commit');

/* Find all changes and return parsed change definitions. */
function findChangesSync() {
  let changeFiles = [];
  let allChanges = {};
  let changesPath = path.join(process.cwd(), 'changes');

  console.log(`Finding changes in: ${changesPath}`);

  try {
    changeFiles = fs.readdirSync(changesPath).filter(filename => filename.indexOf('.json') >= 0);
  } catch (e) { }

  // Add the minimum changes defined by the change descriptions.
  changeFiles.forEach((file) => {
    let fullPath = path.resolve('./changes', file);
    let changeDescription = JSON.parse(fs.readFileSync(fullPath, 'utf8'));

    for (let i = 0; i < changeDescription.changes.length; i++) {
      let change = changeDescription.changes[i];

      addChange(allChanges, change.packageName, _allPackages[change.packageName].path, _changeTypes[change.type], change.comments);
    }
  });

  let packages = Object.keys(allChanges);
  let updatedDeps = {};

  // Update the versions for downstream dependencies within the repo.
  for (let packageName of packages) {
    addDependencies(allChanges, packageName, updatedDeps);
  }

  // Update orders so that downstreams are marked to come after upstreams.
  for (let packageName in allChanges) {
    let change = allChanges[packageName];
    let pkg = _allPackages[packageName].package;
    let deps = _downstreamDeps[packageName];

    // Write the new version expected for the change.
    change.newVersion = (change.changeType > _changeTypes.dependency) ? semver.inc(pkg.version, _changeTypes[change.changeType]) : pkg.version;

    if (deps) {
      for (let depName of deps) {
        let depChange = allChanges[depName];

        if (depChange) {
          depChange.order = Math.max(change.order + 1, depChange.order);
        }
      }
    }
  }

  return allChanges;
}

/** Add a change request to the allChanges dictionary if necessary. */
function addChange(allChanges, packageName, packagePath, changeType, comments) {
  comments = comments || [];

  if (!allChanges[packageName]) {
    allChanges[packageName] = { packageName, packagePath, changeType, comments, order: 0 };
  } else {
    let currentChange = allChanges[packageName];

    currentChange.changeType = Math.max(currentChange.changeType, changeType);
    currentChange.comments = currentChange.comments.concat(comments);
  }
}

/** Build a downstream dependencies lookup table. */
function getDownstreamDependencies() {
  let downstreamDeps = {};

  forEachPackage('.', (pkg, location) => {
    for (let depName in pkg.dependencies) {
      if (!downstreamDeps[depName]) {
        downstreamDeps[depName] = [];
      }
      downstreamDeps[depName].push(pkg.name);
    }
  });

  return downstreamDeps;
}

/** Add downstream changes that are implicitly required by version bumps. */
function addDependencies(allChanges, packageName, updatedDeps) {
  if (!updatedDeps) {
    updatedDeps = {};
  }

  if (!updatedDeps[packageName]) {
    updatedDeps[packageName] = true;
    let change = allChanges[packageName];
    let dependencies = _downstreamDeps[packageName];

    for (let i = 0; dependencies && i < dependencies.length; i++) {
      let depPackage = _allPackages[dependencies[i]];

      addChange(
        allChanges,
        depPackage.package.name,
        depPackage.path,
        _changeTypes.dependency,
        [`Updating dependency: ${packageName}`]
      );

      addDependencies(allChanges, dependencies[i], updatedDeps);
    }
  }
}

/** Print changes to apply. */
function printChanges(changes) {
  for (let changeName in changes) {
    let change = changes[changeName];

    if (_allPackages[change.packageName]) {
      let pkg = _allPackages[change.packageName].package;
      let newVersion = (change.changeType > _changeTypes.dependency) ? semver.inc(pkg.version, _changeTypes[change.changeType]) : pkg.version;

      console.log(`${change.packageName} [${_changeTypes[change.changeType]}] ${pkg.version} -> ${newVersion}`);
      change.comments.forEach(comment => console.log(`|-- ${comment}`))
    }
  }
}

/** Apply set of changes. */
function applyChanges(allChanges) {
  let orderedChanges = (
    Object
      .keys(allChanges)
      .map(key => allChanges[key])
      .sort((a, b) => a.order < b.order ? -1 : 1));
  if (orderedChanges.length > 1) {
    for (let change of orderedChanges) {
      updatePackage(change, allChanges);
      updateChangeLog(change);
    }

    deleteChangeFiles();
    commitChanges();

    for (let change of orderedChanges) {
      publishPackage(change);
    }

    commitTags(allChanges);
  }
}

/** Update the package.json for a given change. */
function updatePackage(change, allChanges) {

  console.log(os.EOL + `* Applying ${_changeTypes[change.changeType]} update for ${change.packageName} to ${change.newVersion}`);

  let pkg = _allPackages[change.packageName].package;

  for (let depName in pkg.dependencies) {
    let depChange = allChanges[depName];

    if (depChange) {
      let requiredVersion = pkg.dependencies[depName];
      let newVersionRange = `>=${depChange.newVersion} <${semver.inc(change.newVersion, 'major')}`;

      console.log(` - updating ${depName}: ${requiredVersion} to ${newVersionRange}`);
      pkg.dependencies[depName] = newVersionRange;

      if (!semver.satisfies(change.newVersion, requiredVersion)) {
        change.changeType = Math.max(change.changeType, _changeTypes.patch);
        change.newVersion = semver.inc(pkg.version, _changeTypes[change.changeType]);
      }
    }
  }

  pkg.version = change.newVersion;

  if (_shouldCommit) {
    fs.writeFileSync(change.packagePath, JSON.stringify(pkg, null, 2), 'utf8');
  }
}

function commitChanges() {
  // git add
  // git commit
  // git push
  console.log(os.EOL + `Committing all changes`);
}

function publishPackage(change) {
  // npm publish
  console.log(os.EOL + `Running: npm publish ${change.packageName}`);
}

function commitTags(changes) {
  console.log(os.EOL + `Committing tags`);
}

function updateChangeLog(change) {
  console.log(` - updating CHANGELOG.md`);
}

function deleteChangeFiles() {
  let changesPath = path.join(process.cwd(), 'changes');
  let changeFiles = [];
  console.log(`Deleting change requests`);

  try {
    changeFiles = fs.readdirSync(changesPath).filter(filename => filename.indexOf('.json') >= 0);
  } catch (e) { }

  if (changeFiles.length) {
    console.log(`Deleting ${changeFiles.length} change file(s).`);

    for (let fileName of changeFiles) {
      let filePath = path.join(changesPath, fileName);

      console.log(` - ${ filePath}`);

      deleteFile(filePath);
    }
  }
}

let changes = findChangesSync();

applyChanges(changes);
// printChanges(changes);