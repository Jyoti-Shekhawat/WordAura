// WordAura - English dictionary
// Main API:     Merriam-Webster (Collegiate Dictionary + Collegiate Thesaurus)
// Fallback API: Datamuse (used if Merriam-Webster fails, the word isn't found, or no key is set)

// >>> PUT YOUR FREE KEYS HERE (from dictionaryapi.com) <<<
const MW_DICT_KEY = "22d93782-659b-474c-a1e8-260f10803f72";
const MW_THES_KEY = "2d57909c-0d7d-472f-9fa7-8f6a457a06e1";

const mwDictUrl = "https://www.dictionaryapi.com/api/v3/references/collegiate/json/";
const mwThesUrl = "https://www.dictionaryapi.com/api/v3/references/thesaurus/json/";
const fallbackUrl = "https://api.datamuse.com/words";

let btn = document.querySelector("#btn");
let definitionList = document.querySelector("#definition");
let synonymList = document.querySelector("#synonymList");
let antonymsList = document.querySelector("#antonymsList");
let errorElement = document.querySelector("#error");
let div = document.querySelector("#phonetics");

let hDef = document.createElement("h5");
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

btn.addEventListener("click", async (event) => {
    event.preventDefault();
    let word = document.querySelector("#input").value.trim();
    if (!word) return; // ignore empty searches

    try {
        emptyList();
        div.append(word);
        await Dictionary(word);
    } catch (e) {
        errorElement.innerText = e.message || e;
    }
});

// ---------- helpers ----------

function emptyList() {
    errorElement.innerText = "";
    clearList(definitionList);
    clearList(synonymList);
    clearList(antonymsList);
    div.textContent = ""; // removes old word, phonetics text and icon
    hDef.remove();
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

// ---------- main flow ----------

async function Dictionary(word) {
    try {
        await merriamWebster(word);
    } catch (e) {
        // Merriam-Webster failed / word not found / key missing -> try the fallback
        console.log("Merriam-Webster failed:", e);
        try {
            emptyList();
            div.append(word);
            await fallbackDictionary(word);
        } catch (e2) {
            errorElement.innerText =
                "Sorry, we couldn't find definitions for \"" + word + "\".";
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

async function merriamWebster(word) {
    if (MW_DICT_KEY.startsWith("YOUR_")) throw new Error("No Merriam-Webster key set");

    const w = encodeURIComponent(word);
    const [dictRes, thesRes] = await Promise.allSettled([
        axios.get(mwDictUrl + w + "?key=" + MW_DICT_KEY),
        axios.get(mwThesUrl + w + "?key=" + MW_THES_KEY)
    ]);

    if (dictRes.status !== "fulfilled" || !isEntries(dictRes.value.data)) {
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
