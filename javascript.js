// WordAura - English dictionary
// Main API:     Merriam-Webster (Collegiate Dictionary + Collegiate Thesaurus)
// Fallback API: Datamuse (used if Merriam-Webster fails, the word isn't found, or no key is set)
// Autocomplete: Datamuse suggestions (no key needed, doesn't use your Merriam-Webster limit)

// >>> PUT YOUR FREE KEYS HERE (from dictionaryapi.com) <<<
const MW_DICT_KEY = "22d93782-659b-474c-a1e8-260f10803f72";
const MW_THES_KEY = "2d57909c-0d7d-472f-9fa7-8f6a457a06e1";

const mwDictUrl = "https://www.dictionaryapi.com/api/v3/references/collegiate/json/";
const mwThesUrl = "https://www.dictionaryapi.com/api/v3/references/thesaurus/json/";
const fallbackUrl = "https://api.datamuse.com/words";
const suggestUrl = "https://api.datamuse.com/sug";

let btn = document.querySelector("#btn");
let input = document.querySelector("#input");
let form = document.querySelector("form");
let definitionList = document.querySelector("#definition");
let synonymList = document.querySelector("#synonymList");
let antonymsList = document.querySelector("#antonymsList");
let errorElement = document.querySelector("#error");
let div = document.querySelector("#phonetics");

// The examples list is created here, so index.html needs no change
let exampleList = document.querySelector("#exampleList");
if (!exampleList) {
    exampleList = document.createElement("ul");
    exampleList.id = "exampleList";
    definitionList.insertAdjacentElement("afterend", exampleList);
}

let hDef = document.createElement("h5");
let hEx = document.createElement("h5");
let hSyn = document.createElement("h5");
let hAnt = document.createElement("h5");
let noAntData = document.createElement("p");
let noSynData = document.createElement("p");
let text = document.createElement("span");
let icon = document.createElement("i");
let audio = null;

noAntData.classList.add("text");
noSynData.classList.add("text");
icon.classList.add("fa-solid", "fa-volume-high");

// ---------- search ----------

btn.addEventListener("click", (event) => {
    event.preventDefault();
    hideSuggestions();
    searchWord(input.value.trim());
});

async function searchWord(word) {
    if (!word) return; // ignore empty searches
    try {
        emptyList();
        div.append(word);
        await Dictionary(word);
    } catch (e) {
        errorElement.innerText = e.message || e;
    }
}

// ---------- helpers ----------

function emptyList() {
    errorElement.innerText = "";
    clearList(definitionList);
    clearList(exampleList);
    clearList(synonymList);
    clearList(antonymsList);
    div.textContent = ""; // removes old word, phonetics text and icon
    text.innerText = "";
    hDef.remove();
    hEx.remove();
    hSyn.remove();
    hAnt.remove();
    noAntData.remove();
    noSynData.remove();
    audio = null;
}

function clearList(list) {
    while (list.firstChild) {
        list.removeChild(list.firstChild);
    }
}

// Shows a heading + up to 5 items in a list, or "no data found"
function showWords(words, listEl, headingEl, title, emptyEl) {
    headingEl.innerText = title;
    headingEl.style.color = "yellowgreen";
    listEl.insertAdjacentElement("beforebegin", headingEl);

    if (words.length === 0) {
        emptyEl.innerText = "no data found";
        headingEl.insertAdjacentElement("afterend", emptyEl);
        return;
    }
    for (let i = 0; i < words.length && i < 5; i++) {
        let li = document.createElement("li");
        li.innerText = words[i];
        listEl.appendChild(li);
    }
}

function showDefinitions(defs) {
    hDef.innerText = "DEFINITION";
    hDef.style.color = "yellowgreen";
    definitionList.insertAdjacentElement("beforebegin", hDef);
    defs.slice(0, 5).forEach((d) => {
        let li = document.createElement("li");
        li.innerText = d;
        definitionList.appendChild(li);
    });
}

// Shows the EXAMPLES section only when examples exist
function showExamples(examples) {
    if (examples.length === 0) return;
    hEx.innerText = "EXAMPLES";
    hEx.style.color = "yellowgreen";
    exampleList.insertAdjacentElement("beforebegin", hEx);
    examples.forEach((ex) => {
        let li = document.createElement("li");
        li.innerText = "\u201C" + ex + "\u201D";
        exampleList.appendChild(li);
    });
}

// ---------- main flow ----------

async function Dictionary(word) {
    try {
        await merriamWebster(word);
    } catch (e) {
        console.log("Merriam-Webster failed:", e);
        let reason = e.message || e;
        try {
            emptyList();
            div.append(word);
            await fallbackDictionary(word);
            errorElement.style.fontSize = "16px";
            errorElement.innerText = "Showing basic results. Merriam-Webster unavailable: " + reason;
        } catch (e2) {
            errorElement.innerText =
                "Sorry, we couldn't find definitions for \"" + word + "\". (" + reason + ")";
        }
    }
}

// ---------- Merriam-Webster ----------

// Merriam-Webster returns an array of entry OBJECTS when the word is found,
// or an array of suggestion STRINGS when it isn't.
function isEntries(data) {
    return Array.isArray(data) && data.length > 0 && typeof data[0] === "object";
}

// Audio files live in a folder that depends on the file name
function mwAudioUrl(name) {
    let folder;
    if (name.startsWith("bix")) folder = "bix";
    else if (name.startsWith("gg")) folder = "gg";
    else if (/^[0-9_\W]/.test(name)) folder = "number";
    else folder = name.charAt(0);
    return "https://media.merriam-webster.com/audio/prons/en/us/mp3/" + folder + "/" + name + ".mp3";
}

// Merriam-Webster text contains markup like {it}word{/it} or {d_link|word|id}
function cleanMarkup(s) {
    return s
        .replace(/\{(?:a_link|d_link|i_link|et_link|mat|sx)\|([^|}]*)[^}]*\}/g, "$1")
        .replace(/\{[^}]*\}/g, "")
        .trim();
}

// Finds example sentences ("vis" blocks) anywhere inside the entries' definitions
function collectExamples(entries, max) {
    let out = [];
    function walk(node) {
        if (out.length >= max || node === null || typeof node !== "object") return;
        if (Array.isArray(node)) {
            if (node[0] === "vis" && Array.isArray(node[1])) {
                node[1].forEach((v) => {
                    if (v && v.t && out.length < max) out.push(cleanMarkup(v.t));
                });
                return;
            }
            node.forEach(walk);
        } else {
            Object.values(node).forEach(walk);
        }
    }
    entries.forEach((en) => walk(en.def));
    return out;
}

async function merriamWebster(word) {
    if (MW_DICT_KEY.startsWith("YOUR_")) throw new Error("No Merriam-Webster key set");

    const w = encodeURIComponent(word);
    const [dictRes, thesRes] = await Promise.allSettled([
        axios.get(mwDictUrl + w + "?key=" + MW_DICT_KEY),
        axios.get(mwThesUrl + w + "?key=" + MW_THES_KEY)
    ]);

       if (dictRes.status !== "fulfilled") {
        throw new Error("Could not reach Merriam-Webster (" + (dictRes.reason && dictRes.reason.message) + ")");
    }
    if (typeof dictRes.value.data === "string") {
        throw new Error("Merriam-Webster rejected the key: " + dictRes.value.data);
    }
    if (!isEntries(dictRes.value.data)) {
        throw new Error("Word not found in Merriam-Webster");
    }

    // Keep entries for the searched word (ids look like "hello" or "run:1"); otherwise use all
    let entries = dictRes.value.data;
    let exact = entries.filter(
        (en) => en.meta && en.meta.id && en.meta.id.split(":")[0].toLowerCase() === word.toLowerCase()
    );
    if (exact.length > 0) entries = exact;

    // Phonetics text + audio (first one available)
    for (let i = 0; i < entries.length; i++) {
        let prs = entries[i].hwi && entries[i].hwi.prs;
        if (!prs || prs.length === 0) continue;

        if (prs[0].mw && !text.innerText) {
            text.innerText = "\\" + prs[0].mw + "\\";
            div.appendChild(text);
        }
        if (!audio) {
            let p = prs.find((x) => x.sound && x.sound.audio);
            if (p) {
                audio = new Audio(mwAudioUrl(p.sound.audio));
                div.insertAdjacentElement("afterbegin", icon);
            }
        }
    }

    // Definitions (shortdef), with part of speech in front
    let defs = [];
    entries.forEach((en) => {
        (en.shortdef || []).forEach((d) => {
            defs.push(en.fl ? "(" + en.fl + ") " + d : d);
        });
    });
    if (defs.length === 0) throw new Error("No definitions");
    showDefinitions(defs);

    // Example sentences (up to 3)
    showExamples(collectExamples(entries, 3));

    // Synonyms and antonyms from the thesaurus (optional)
    let syns = [];
    let ants = [];
    if (thesRes.status === "fulfilled" && isEntries(thesRes.value.data)) {
        thesRes.value.data.forEach((en) => {
            if (!en.meta) return;
            (en.meta.syns || []).forEach((group) => syns.push(...group));
            (en.meta.ants || []).forEach((group) => ants.push(...group));
        });
    }
    showWords([...new Set(syns)], synonymList, hSyn, "SYNONYMS", noSynData);
    showWords([...new Set(ants)], antonymsList, hAnt, "ANTONYMS", noAntData);
}

icon.addEventListener("click", () => {
    if (audio) {
        audio.play();
    }
});

// ---------- fallback API (Datamuse) ----------

async function fallbackDictionary(word) {
    const w = encodeURIComponent(word);
    const [defRes, synRes, antRes] = await Promise.all([
        axios.get(`${fallbackUrl}?sp=${w}&md=d&max=1`),
        axios.get(`${fallbackUrl}?rel_syn=${w}&max=5`),
        axios.get(`${fallbackUrl}?rel_ant=${w}&max=5`)
    ]);

    const defs = (defRes.data[0] && defRes.data[0].defs) || [];
    if (defs.length === 0) throw new Error("Word not found");

    // Each definition looks like "n\tmeaning text" - keep the text after the tab
    showDefinitions(defs.map((d) => d.split("\t")[1] || d));
    showWords(synRes.data.map((x) => x.word), synonymList, hSyn, "SYNONYMS", noSynData);
    showWords(antRes.data.map((x) => x.word), antonymsList, hAnt, "ANTONYMS", noAntData);
}

// ---------- autocomplete (Datamuse) ----------

let suggestBox = document.createElement("ul");
suggestBox.id = "suggestions";
form.appendChild(suggestBox);

let suggestTimer = null;
let suggestReq = 0;
let activeIndex = -1;

input.setAttribute("autocomplete", "off"); // turn off the browser's own suggestions

input.addEventListener("input", () => {
    clearTimeout(suggestTimer);
    let q = input.value.trim();
    if (q.length < 2) {
        hideSuggestions();
        return;
    }
    suggestTimer = setTimeout(() => fetchSuggestions(q), 250); // wait until typing pauses
});

async function fetchSuggestions(q) {
    let id = ++suggestReq;
    try {
        let res = await axios.get(suggestUrl + "?s=" + encodeURIComponent(q) + "&max=6");
        if (id !== suggestReq) return; // a newer request replaced this one
        renderSuggestions(res.data.map((x) => x.word));
    } catch (e) {
        hideSuggestions();
    }
}

function renderSuggestions(words) {
    clearList(suggestBox);
    activeIndex = -1;
    if (words.length === 0) {
        hideSuggestions();
        return;
    }
    words.forEach((word) => {
        let li = document.createElement("li");
        li.innerText = word;
        // mousedown fires before the input loses focus, so the click is never lost
        li.addEventListener("mousedown", (e) => {
            e.preventDefault();
            chooseSuggestion(word);
        });
        suggestBox.appendChild(li);
    });
    // line the box up under the input
    let rect = input.getBoundingClientRect();
    suggestBox.style.left = rect.left + "px";
    suggestBox.style.top = rect.bottom + "px";
    suggestBox.style.width = rect.width + "px";
    suggestBox.style.display = "block";
}

function hideSuggestions() {
    clearTimeout(suggestTimer);
    suggestReq++; // ignore any request still in flight
    suggestBox.style.display = "none";
    clearList(suggestBox);
    activeIndex = -1;
}

function chooseSuggestion(word) {
    input.value = word;
    hideSuggestions();
    searchWord(word);
}

function setActive(index) {
    let items = suggestBox.children;
    for (let i = 0; i < items.length; i++) {
        items[i].classList.toggle("active", i === index);
    }
    activeIndex = index;
}

// Keyboard: arrows to move, Enter to pick, Escape to close
input.addEventListener("keydown", (e) => {
    let count = suggestBox.children.length;
    if (suggestBox.style.display !== "block" || count === 0) return;

    if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((activeIndex + 1) % count);
    } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((activeIndex - 1 + count) % count);
    } else if (e.key === "Enter" && activeIndex >= 0) {
        e.preventDefault();
        chooseSuggestion(suggestBox.children[activeIndex].innerText);
    } else if (e.key === "Escape") {
        hideSuggestions();
    }
});

// Click anywhere else closes the list
document.addEventListener("click", (e) => {
    if (e.target !== input && !suggestBox.contains(e.target)) {
        hideSuggestions();
    }
});

window.addEventListener("resize", hideSuggestions);
window.addEventListener("scroll", hideSuggestions, true);
