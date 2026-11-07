const InterventionManager = {
    handleDocumentChange: (event) => {
        // dummy implementation
        let count = 0;
        for (const change of event.contentChanges) {
             count++;
        }
        return count;
    }
}

const pendingEvents = [];
for (let i = 0; i < 1000; i++) {
    pendingEvents.push({
        document: "doc1",
        contentChanges: [{text: "a"}, {text: "b"}]
    });
}

console.time("Loop");
for (const event of pendingEvents) {
    InterventionManager.handleDocumentChange(event);
}
console.timeEnd("Loop");


console.time("Merged");
const mergedEvent = {
    document: pendingEvents[0].document,
    contentChanges: pendingEvents.flatMap(e => e.contentChanges)
};
InterventionManager.handleDocumentChange(mergedEvent);
console.timeEnd("Merged");
