const fs = require('fs');
let rules = fs.readFileSync('firestore.rules', 'utf8');

const oldFunc = `    function hasActiveOwnedMembershipEndpoints(data) {
      let observationSet = getAfter(/databases/$(database)/documents/observationSets/$(data.observationSetId)).data;
      let observation = getAfter(/databases/$(database)/documents/observations/$(data.observationId)).data;
      return observationSet.uid == request.auth.uid
        && observation.uid == request.auth.uid
        && observationSet.get('schemaVersion', 'none') == '2.0.0'
        && observation.get('schemaVersion', 'none') == '2.0.0'
        && observationSet.get('deletedAt', null) == null
        && observation.get('deletedAt', null) == null;
    }`;

const newFunc = `    function hasActiveOwnedMembershipEndpoints(data) {
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

rules = rules.replace(oldFunc, newFunc);
fs.writeFileSync('firestore.rules', rules);
