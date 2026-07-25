const fs = require('fs');
let rules = fs.readFileSync('firestore.rules', 'utf8');

const oldFunc = `    function hasActiveOwnedMembershipEndpoints(data) {
      let setPath = /databases/$(database)/documents/observationSets/$(data.observationSetId);
      let obsPath = /databases/$(database)/documents/observations/$(data.observationId);
      return existsAfter(setPath) && existsAfter(obsPath)
        && getAfter(setPath).data.uid == request.auth.uid
        && getAfter(obsPath).data.uid == request.auth.uid
        && getAfter(setPath).data.get('schemaVersion', 'none') == '2.0.0'
        && getAfter(obsPath).data.get('schemaVersion', 'none') == '2.0.0'
        && getAfter(setPath).data.get('deletedAt', null) == null
        && getAfter(obsPath).data.get('deletedAt', null) == null;
    }`;

const newFunc = `    function hasActiveOwnedMembershipEndpoints(data) {
      let setPath = /databases/$(database)/documents/observationSets/$(data.observationSetId);
      let obsPath = /databases/$(database)/documents/observations/$(data.observationId);
      return exists(setPath) && exists(obsPath)
        && get(setPath).data.uid == request.auth.uid
        && get(obsPath).data.uid == request.auth.uid
        && get(setPath).data.get('schemaVersion', 'none') == '2.0.0'
        && get(obsPath).data.get('schemaVersion', 'none') == '2.0.0'
        && get(setPath).data.get('deletedAt', null) == null
        && get(obsPath).data.get('deletedAt', null) == null;
    }`;

rules = rules.replace(oldFunc, newFunc);
fs.writeFileSync('firestore.rules', rules);
