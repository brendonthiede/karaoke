function toggleChords() {
    console.log("Toggling chords");
    const chords = document.querySelectorAll("span.chord");
    for (let i = 0; i < chords.length; i++) {
        if (chords[i].style.display == "none") {
            chords[i].style.display = "inline";
        } else {
            chords[i].style.display = "none";
        }
    }
}

const elem = document.createElement("input");
elem.setAttribute("type", "button");
elem.setAttribute("value", "Toggle chords");
elem.setAttribute("id", "toggleChords");
elem.setAttribute("style", "position: fixed; top: 88px; right: 0; z-index: 1000; font-size: x-small");
elem.addEventListener("click", toggleChords);
document.body.appendChild(elem);

const style = document.createElement("style");
style.innerHTML = "@media print { #toggleChords { display: none; } }";
document.head.appendChild(style);
