const pendingEvents = [
    { document: "doc1", contentChanges: [{text: "a"}, {text: "b"}] },
    { document: "doc1", contentChanges: [{text: "c"}, {text: "d"}] },
];

const mergedEvent = {
    document: pendingEvents[0].document,
    contentChanges: pendingEvents.flatMap(e => e.contentChanges)
};
console.log(mergedEvent);
