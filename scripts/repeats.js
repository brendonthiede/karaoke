// `<details data-repeat="id">` shows only its section name until tapped, and fills
// itself from the section with that id — a repeated chorus is written out once.
for (const details of document.querySelectorAll("details[data-repeat]")) {
    const source = document.getElementById(details.dataset.repeat);
    if (!source) {
        console.error(`No section with id "${details.dataset.repeat}" to repeat`);
        continue;
    }
    for (const node of source.childNodes) {
        if (!node.classList?.contains("section")) {
            details.append(node.cloneNode(true));
        }
    }
}
