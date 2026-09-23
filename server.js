// server.ts
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

// src/data/defaultEmployees.ts
var rawEmployeeRows = [
  ["103196", "ONKY RAMDHANI.", "PRODUCT SPECIALIST", "11/08/1978"],
  ["103337", "PRIMA MAELANA", "SMT", "16/10/1989"],
  ["103408", "DODI MISBAHUDIN", "PRODUCT SPECIALIST", "20/05/1991"],
  ["103502", "JAMALUDIN", "LOGISTIC STAFF", "25/02/1994"],
  ["104140", "VICKY ALFARIZI", "PRODUCT SPECIALIST", "13/07/1997"],
  ["105269", "AHMAD SOBANDI", "SMT", "20/12/1988"],
  ["105326", "ASEP SAEPULLAH", "SMT", "24/05/1996"],
  ["105342", "SELVIANI EKAPRATIWI", "DESIGNER", "04/01/1994"],
  ["106202", "PEPI FIRDAUS", "SMT", "07/03/1987"],
  ["106399", "PRATAMA SUKARNO PUTRA", "SMT", "04/12/1990"],
  ["106441", "CECEP RIKI", "PRODUCT SPECIALIST", "05/08/1992"],
  ["106477", "BAYU SUKANDANI", "PRODUCT SPECIALIST", "31/05/1985"],
  ["106504", "WAHYU SUSANTO", "SMT", "07/10/1990"],
  ["106510", "BUDI MAULANA", "LOGISTIC STAFF", "27/12/1982"],
  ["106531", "NURJAYA", "PRODUCT SPECIALIST", "23/10/1993"],
  ["106533", "LUTFI AZIS ARRASYID", "PRODUCT SPECIALIST", "17/06/1997"],
  ["106643", "ABDULLAH", "SMT", "06/04/1980"],
  ["107466", "SITI BADRIAH", "CASHIER", "30/11/1990"],
  ["107469", "MUHAMAD HAERUL ANWAR", "LOGISTIC STAFF", "12/05/1987"],
  ["107797", "ROFIYANDI.", "DEPUTY AREA MANAGER", "09/01/1990"],
  ["108387", "CHOIRUN NISSA", "SMT", "16/04/1983"],
  ["108392", "SYAFRIANSYAH", "PRODUCT SPECIALIST", "30/05/1989"],
  ["110376", "FEBIN EDWANSYAH", "SMT", "26/09/1993"],
  ["111711", "ABDUL HAKIM", "DEPUTY STORE OPERATION MANAGER", "28/07/1989"],
  ["111740", "RETIANA AYUNING WARDAYA", "SMT", "03/03/1987"],
  ["112669", "DWI APRINA", "SMT", "25/04/1991"],
  ["113128", "DWI ARISANDI", "DEPUTY STORE OPERATION MANAGER", "29/01/1995"],
  ["113130", "WILLA ERISIANI ALSUNDRIA", "CASHIER", "16/02/1991"],
  ["114802", "ANGGA FARAMOUR PUTRA", "DEPUTY STORE OPERATION MANAGER", "10/04/1987"],
  ["115570", "NOVITA SARI", "SMT", "03/10/1990"],
  ["116405", "PIRMAN ALAMSYAH", "PRODUCT SPECIALIST", "20/07/1986"],
  ["116797", "SRI ANDINI", "CASHIER", "27/07/1990"],
  ["117452", "DODI SANMARTIN", "SMT", "29/04/1991"],
  ["118286", "JATMIKO EDY TANTOMO", "PRODUCT SPECIALIST", "23/01/1989"],
  ["118754", "FAHRUL ROJI", "LOGISTIC STAFF", "12/03/1991"],
  ["119738", "NANDA WARIZKA", "SMT", "04/10/1996"],
  ["119861", "ANGKY LESMANA", "SMT", "18/09/1986"],
  ["120855", "FAIDZ ESSA RIVALDHY", "SALES CONSULTANT", "24/05/1998"],
  ["121591", "YOSEP YUDISTIRA", "SMT", "05/06/1986"],
  ["121708", "SHELI MIGKA", "PRODUCT SPECIALIST", "06/12/1994"],
  ["122145", "HERMAWAN", "LOGISTIC STAFF", "10/07/1988"],
  ["122147", "KHOMARUDIN", "PRODUCT SPECIALIST", "18/10/1993"],
  ["122727", "RETNO BUDI RIANTO", "SMT", "14/03/1987"],
  ["125438", "RISKA ADRIAN", "LOGISTIC STAFF", "21/11/1993"],
  ["127486", "VENI SELLA", "CASHIER", "23/11/1996"],
  ["130203", "LISTANTO", "PRODUCT SPECIALIST", "27/06/1993"],
  ["130459", "ADEI VAHLEVIE", "SMT", "21/04/1989"],
  ["131011", "IVAN MUSTASVA ARIANTO", "PRODUCT SPECIALIST (KELS)", "12/07/1996"],
  ["131184", "DEDE ABDUL HAMID", "PRODUCT SPECIALIST", "08/08/1996"],
  ["133169", "PERDI DWISEPTIAN", "SMT", "02/09/1987"],
  ["134298", "CHAIRUL IMAN", "PRODUCT SPECIALIST (KELS)", "02/02/1993"],
  ["137141", "SEPTIAN DWI YOGA", "DEPUTY STORE OPERATION MANAGER", "17/01/1995"],
  ["137443", "ULFAN ADITA PRATAMA", "SMT", "30/06/1990"],
  ["138977", "MEYLINDA LELIANA BR SARAGIH", "DEPUTY AREA MANAGER", "22/05/1995"],
  ["139563", "DEAN RIZKYANDANI", "PRODUCT SPECIALIST", "15/08/1997"],
  ["5470", "ALI SOPJAN", "PRODUCT SPECIALIST", "10/07/1979"],
  ["142106", "FAISAL RAMADHAN", "SMT", "19/03/1992"],
  ["143021", "NUKY SEPTIAN CHRISANDY", "SMT", "11/09/1998"],
  ["144244", "MAGDALENA EVI FANI", "CASHIER", "04/12/1991"],
  ["148068", "ZAM ZAM SALEHUDIN AHMADI", "SMT", "21/10/1998"],
  ["152132", "RIDHO ZAKARIA", "SALES CONSULTANT", "19/10/1995"],
  ["152459", "ARIEF RACHMAN KOTHO", "CASHIER", "22/09/1994"],
  ["154035", "MOCHAMMAD SANWANI", "SMT", "14/08/1993"],
  ["154251", "FITRI SILPANI", "SMT", "06/02/1996"],
  ["160190", "MUHAMMAD CHOIRUL", "SMT", "22/07/1998"],
  ["160429", "BAYU CAHYO HUTOYO", "SMT", "27/01/1997"],
  ["161643", "MUCHAMMAD SOFYAN", "PRODUCT SPECIALIST", "18/02/1994"],
  ["162284", "YUKI FHILIF SAPUTRA", "SMT", "04/03/1999"],
  ["162604", "RICKY SUBAGJA", "SMT", "24/07/1994"],
  ["164546", "TAUFIK RAHMAN", "CASHIER", "06/02/1996"],
  ["164746", "HUSNUL KHOTIMAH", "CASHIER", "23/01/2000"],
  ["164820", "DWI ARI ARDIYANTO", "CASHIER", "25/08/1998"],
  ["165513", "MOH FARHAN NURRAHMAN", "SMT", "12/02/1998"],
  ["165520", "SHEILA AMELIA", "CASHIER", "08/02/2000"],
  ["166874", "AURELIO ADOLF KOMUNA", "DEPUTY AREA MANAGER", "21/11/1999"],
  ["166968", "MOHAMMAD RIZALY FAHMI AFANDI", "SMT", "06/10/1998"],
  ["167677", "MUHAMMAD FARIZ", "LOGISTIC STAFF", "17/04/2000"],
  ["168289", "GABRIEL SEBASTIAN JAMES UMBOH", "SMT", "15/04/2001"],
  ["169787", "AZIZAH FAUZIAH", "CASHIER", "14/07/2000"],
  ["171189", "ABDURAHMAN WAHID", "SMT", "02/10/1999"],
  ["171706", "DISHA FEBRIANI", "SMT", "10/02/1998"],
  ["171707", "PUTRI AYU NAIBAHO", "SMT", "16/03/1998"],
  ["171995", "GALUH DEWI ANJANI", "SMT", "23/07/1999"],
  ["171999", "INDAH LIANA SARI", "SMT", "26/04/1996"],
  ["172000", "AZRIM ANGKONI", "SMT", "22/08/1995"],
  ["172530", "NELVI YANTI", "CASHIER", "01/12/1999"],
  ["172644", "SADAM AL FAYED", "SMT", "30/08/1998"],
  ["173609", "TOMY PUTRA AGUSTIEN", "SMT", "29/09/1995"],
  ["173763", "FERHANS IQBAL HERDIANSYAH", "SMT", "17/06/2004"],
  ["174457", "FERA YUNIAR", "SMT", "08/06/1997"],
  ["174999", "RIZKI DERMAWAN", "SALES CONSULTANT", "16/11/1998"],
  ["175001", "FERDIAWAN", "SMT", "02/03/1994"],
  ["175004", "RAFLI ZUL AZHAR", "SMT", "04/06/1994"],
  ["175495", "TONI HIDAYAT", "SMT", "29/07/1998"],
  ["175496", "FATHAN AZIS", "SMT", "11/05/2000"],
  ["175694", "TIFANI HERAWATI", "SMT", "29/04/1998"],
  ["175832", "ASRIADI ASGAR", "SMT", "08/11/1998"],
  ["175833", "AZIZ MIFTAHUL FAUZI", "SMT", "27/03/1998"],
  ["175981", "FITRI RAMAYANTI", "SMT", "23/01/1998"],
  ["176136", "RIDHO GUSTIANTORO", "SMT", "25/08/1997"],
  ["176137", "RAHMAT ADITYA", "SMT", "01/02/1999"],
  ["176138", "AHMAD FADILA", "SMT", "11/02/2000"],
  ["176140", "WAHYU PERMANA", "SMT", "29/08/1999"],
  ["176141", "MUHAMAD YUSUF", "SMT", "30/07/1998"],
  ["176142", "ISHAM MUSTAFID", "SMT", "17/11/1995"],
  ["176338", "HAERUDIN", "CASHIER", "11/09/1999"],
  ["176556", "HERRY YUSWAN", "SMT", "22/02/1997"],
  ["176646", "RIZKY FADHILLA", "SMT", "27/10/1997"],
  ["176649", "PREDIANSYAH", "SMT", "22/03/2004"],
  ["176651", "NIA AULINA", "SMT", "18/08/1999"],
  ["176728", "NANDA SETIANA", "SMT", "01/09/1998"],
  ["176730", "ABDUL AZIS", "SMT", "15/02/1996"],
  ["176927", "ALDI", "SMT", "23/06/2005"],
  ["176928", "REPAN", "SMT", "07/01/2002"],
  ["177063", "NABILAH ADANI", "SMT", "27/07/2000"],
  ["177065", "VANNY ERIYANI", "SMT", "22/09/2001"],
  ["177464", "RIZKY SETIAWAN", "CASHIER", "05/03/1999"],
  ["177535", "NUR LISTIANA", "SMT", "22/09/1997"],
  ["178197", "RYAN YULIANTO", "SMT", "31/07/2003"],
  ["179029", "YUDA ADITYA NUGRAHA", "SMT", "16/10/1998"],
  ["179039", "RISSA NURSANTI", "SMT", "06/08/2001"],
  ["179235", "MUCHLIS", "CASHIER", "09/10/1997"],
  ["179583", "RAMA DHANI", "SMT", "03/01/1999"],
  ["179589", "ILLA HUMAIROH", "SMT", "01/09/1998"],
  ["179965", "MUHAMAD AGUNG", "SMT", "31/12/1997"],
  ["179967", "ALI SAID", "CASHIER", "19/05/2002"],
  ["180432", "AGUSTIANSYAH", "SMT", "17/08/1996"],
  ["180436", "FIKRI MAULANA", "SMT", "19/04/2005"],
  ["181370", "KAMILA INDAH PRATIWI", "SMT", "15/03/2000"],
  ["181372", "HERIYAWAN", "CASHIER", "19/08/2000"],
  ["181680", "MAHSYA IZDIHAR", "SMT", "22/08/2003"],
  ["182106", "YOGA MATORIS", "SMT", "17/02/2000"],
  ["182109", "BAGAS PRAYOGA", "SMT", "03/03/1996"],
  ["182110", "HAFIDZ ABDULLAH", "SMT", "10/12/2001"],
  ["182995", "RICO ARI SAPUTRA", "SMT", "25/07/1998"],
  ["183138", "ALFIAN KRISNA BAYU GP", "SMT", "24/10/1998"],
  ["183303", "ABIL DURAHMAN", "SMT", "06/01/2001"],
  ["183726", "FAJRI SURYA RAMADHAN", "SMT", "31/10/2003"],
  ["183728", "MUHAMAD DAFFA ALDIAN SYAHPUTRA", "SMT", "07/10/2003"],
  ["183729", "RAFI GENTA RAMADAN", "SMT", "22/11/2002"],
  ["183731", "SAEKHONI YAHYA", "SMT", "02/08/2000"],
  ["184454", "SULAEMAN", "LOGISTIC STAFF", "03/08/2001"],
  ["184826", "SAMUEL CHRISTIAN", "SMT", "07/05/2001"],
  ["184962", "RAHMAT HIDAYAT", "SMT", "30/08/2000"],
  ["184963", "ADIT KURNIAWAN", "SMT", "07/07/2004"],
  ["185551", "DICKY SETIAWAN", "SMT", "14/10/1996"],
  ["185701", "DEDI ANGGARA", "SMT", "04/12/1995"],
  ["186718", "FARAS AL RIZAL FALAH", "LOGISTIC STAFF", "14/07/2000"],
  ["186905", "MUHAMMAD ZULKARNAIN", "SMT", "28/06/2005"],
  ["186986", "HERDIANSYAH FARHAN TRI SAPUTRA", "SMT", "16/07/2003"],
  ["187014", "ALIF ARDIANSYAH WADJO", "SALES CONSULTANT", "28/06/2000"],
  ["187081", "RONALDO PRATAMA", "SMT", "23/07/1997"],
  ["188489", "SUDIARTO AGUS NUR ROHMAN", "SMT", "31/08/2000"],
  ["189501", "MUHAMAD RIPAL", "SMT", "25/09/2002"],
  ["189824", "SARI NOVATIANI", "SMT", "13/11/1999"],
  ["190017", "DANIEL BUDI PRAKOSO", "SMT", "11/11/2005"],
  ["190020", "WAHYU BUKHORI", "SMT", "13/03/2000"],
  ["190793", "ANDRI", "SMT", "02/02/1997"],
  ["191316", "AGUNG PERMADI", "SMT", "04/08/2000"],
  ["192219", "ATHALLA NAUFAL AL FARIDZ", "SMT", "16/09/1999"],
  ["192303", "AUDY ALIF PUTRA", "SMT", "30/08/1998"],
  ["192340", "SALSA BILAHNURYUDA", "SMT", "16/01/2004"],
  ["192341", "ADJI SURYO TRI NURHASAN", "SALES CONSULTANT", "03/03/1997"],
  ["192426", "RYAN TRI PRASTYO", "SMT", "24/01/2003"],
  ["192427", "PARHAN ANDRIAN", "SMT", "15/11/2000"],
  ["192623", "JABANDI ARYA PRATAMA", "SALES PROJECT OFFICER", "07/10/1999"],
  ["192992", "ILYASA ALIFANSYACH", "SMT", "23/04/2002"],
  ["192993", "FAHREZA NUGROHO", "SMT", "04/01/2001"],
  ["193053", "DENIS ANDRIA JAYA", "DEPUTY STORE OPERATION MANAGER", "09/01/2002"],
  ["193309", "WILFRIDA DWI APRIANA TURNIP", "SMT", "22/04/2002"],
  ["193310", "RIFKI JULIAN", "SMT", "24/07/2004"],
  ["193312", "NAZWA SAFIRA", "SMT", "21/07/2006"],
  ["193455", "MAULANA MARIS", "SMT", "24/10/2000"],
  ["193686", "SELVIA WULANDARI", "SMT", "22/06/2006"],
  ["193688", "RUDI TRESNA", "SMT", "10/07/1996"],
  ["194067", "LUFITA RAMADHANY ZULKIFLY", "SMT", "05/01/1999"],
  ["194353", "INTAN AYU LARASATI", "SMT", "30/08/2005"],
  ["194644", "GILANG RAMADHAN", "SMT", "27/11/2002"],
  ["194645", "DEWI FEBRIANI", "SMT", "04/02/2000"],
  ["194646", "ADITYA KUSUMA YUDISTIRA", "SMT", "20/04/2006"],
  ["194647", "MUHAMAD PRADIPTA", "SMT", "25/07/2005"],
  ["194849", "AFGAN IBNU AZAIDAN", "SMT", "11/05/2005"],
  ["194974", "DANIEL FEBRIAN", "SMT", "05/02/2003"],
  ["194975", "DIVA NURFAUZIAH", "SMT", "30/09/2003"],
  ["194976", "SYAMSUL HIBATULLAH", "SMT", "21/04/2001"],
  ["195002", "DESTA PUJA DINATA", "SMT", "06/09/2006"],
  ["195142", "GANIS MAHARDIKA", "SMT", "13/01/2004"],
  ["195586", "NUR KUSUMO", "SMT", "21/06/1999"],
  ["195587", "NUR ASARO SYAMSAH", "SMT", "13/10/2002"],
  ["195739", "DIKI WAHYUDI", "SMT", "30/01/2002"],
  ["195855", "BAGUS PRAKOSO", "SMT", "06/08/2002"],
  ["196694", "BAMBANG ASMOROSANTO", "LOGISTIC STAFF", "21/09/1986"],
  ["196731", "ANANG DWYAN ROMADHONI", "LOGISTIC STAFF", "05/01/1998"],
  ["196745", "HANDOKO", "LOGISTIC STAFF", "31/05/1998"],
  ["197421", "JESSICA MAHARANI", "SMT", "10/01/2005"],
  ["197422", "ALYA TYA SAMANTA", "SMT", "07/09/2002"],
  ["198809", "RAMADHAN ZAHIR AL DAFFA", "SMT", "10/11/2003"],
  ["198810", "RISANTI OKTAVIANI ASHARI", "SMT", "26/10/1999"],
  ["70089", "HANNY RUDI RIANTO", "PRODUCT SPECIALIST", "12/06/1985"],
  ["90861", "ANDRI", "PRODUCT SPECIALIST", "23/11/1986"],
  ["90862", "SUPRIYADI", "PRODUCT SPECIALIST", "13/07/1985"],
  ["94628", "IDRUS AL MASYHUR.", "DEPUTY STORE OPERATION MANAGER", "14/12/1989"],
  ["94681", "SAIPUDIN WIJAYA", "LOGISTIC STAFF", "29/06/1991"],
  ["94682", "ANDREI HILCES.", "SMT", "20/06/1986"],
  ["94756", "FAHMI UTOMO WIDODO.", "DEPUTY STORE OPERATION MANAGER", "14/01/1989"],
  ["94835", "DADAN ROMANSAH", "LOGISTIC SUPERVISOR", "05/04/1989"],
  ["94836", "SIGIT NOPIYANTO.", "LOGISTIC STAFF", "09/11/1991"],
  ["94840", "LUKMANUL HAKIM.", "SMT", "18/10/1986"],
  ["94871", "BENNI ARIA CITRA PERMANA.", "PRODUCT SPECIALIST", "14/04/1986"],
  ["94992", "CIPTO NUGROHO.", "PRODUCT SPECIALIST", "09/03/1991"],
  ["95386", "ERWIN SYAMSUDIN.", "PRODUCT SPECIALIST", "07/03/1983"],
  ["95845", "M. MACHMUD", "LOGISTIC STAFF", "09/11/1986"],
  ["96254", "FATMA MAULIDA", "SMT", "21/11/1986"],
  ["96802", "MUHAMMAD ADUN", "SMT", "01/10/1987"],
  ["96806", "HAYANIH.", "PRODUCT SPECIALIST", "13/08/1990"],
  ["96814", "ARIE SURIANTO.", "PRODUCT SPECIALIST", "31/08/1983"],
  ["96849", "OKY OKTAVIANUS", "DEPUTY STORE OPERATION MANAGER", "03/07/1987"],
  ["97539", "ELANG PERKASA.", "LOGISTIC SUPERVISOR", "26/09/1986"],
  ["97542", "HAFID ERSAD.", "LOGISTIC STAFF", "06/05/1986"],
  ["98004", "JAENAL ARIPIN", "CASHIER", "12/10/1993"],
  ["98457", "SANDI JATNIKA", "PRODUCT SPECIALIST", "25/01/1988"],
  ["99278", "NASRUL LATIF", "PRODUCT SPECIALIST", "18/07/1985"],
  ["100192", "JAKA SATRIA FADLI", "PRODUCT SPECIALIST", "12/10/1992"],
  ["101172", "RIZKY BUDI PRASTYA", "SMT", "19/05/1992"],
  ["101848", "M. YURIYANSYAH", "PRODUCT SPECIALIST", "29/07/1995"],
  ["101861", "IRONA WULANDARI", "PRODUCT SPECIALIST", "12/04/1995"],
  ["101853", "RIKI SUBAGJA", "SMT", "04/05/1989"],
  ["101854", "SIGIT SANJAYA", "PRODUCT SPECIALIST", "17/07/1994"],
  ["102885", "SUKMA ANDIKA", "SMT", "08/06/1995"]
];
function derivePassword(birthDateStr) {
  const parts = birthDateStr.trim().split("/");
  if (parts.length === 3) {
    const day = parts[0].padStart(2, "0");
    const month = parts[1].padStart(2, "0");
    const year = parts[2];
    return `${year}${month}`;
  }
  return "199001";
}
function deriveRole(title) {
  const upper = title.toUpperCase();
  if (upper.includes("MANAGER") || upper.includes("SUPERVISOR") || upper.includes("DEPUTY")) {
    return "manager";
  }
  if (upper.includes("HR") || upper.includes("HRD")) {
    return "hrd";
  }
  return "staff";
}
function deriveDepartment(title) {
  const upper = title.toUpperCase();
  if (upper.includes("SMT") || upper.includes("SALES")) return "SMT";
  if (upper.includes("PRODUCT SPECIALIST")) return "Product Specialist";
  if (upper.includes("LOGISTIC")) return "Logistik & Gudang";
  if (upper.includes("CASHIER")) return "Kasir & Front Office";
  if (upper.includes("DESIGNER")) return "Interior & Design 3D";
  if (upper.includes("MANAGER") || upper.includes("SUPERVISOR")) return "Store Management";
  return "Back Office Retail";
}
function cleanEmployeeName(raw) {
  if (!raw) return "";
  return raw.replace(/[._\-–]/g, " ").replace(/\s+/g, " ").trim().toLowerCase().split(" ").filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}
var DEFAULT_EMPLOYEES = rawEmployeeRows.map(([nip, name, jobTitle, birthDate]) => {
  return {
    nip: nip.trim(),
    name: cleanEmployeeName(name),
    jobTitle: jobTitle.trim(),
    department: deriveDepartment(jobTitle),
    storeZone: "Informa Alam Sutera",
    birthDate: birthDate.trim(),
    password: derivePassword(birthDate),
    role: deriveRole(jobTitle)
  };
});

// server.ts
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var PORT = Number(process.env.PORT) || 3e3;
var DATA_DIR = path.resolve(__dirname, "data_store");
var DATA_FILE = path.resolve(DATA_DIR, "informa_state.json");
var CLOUD_SYNC_URL = "https://api.restful-api.dev/objects/ff808181a09d98f701a0ccda16b27682";
var NTFY_TOPIC_URL = "https://ntfy.sh/informa_alamsutera_sync_channel";
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
function loadState() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.sessions)) {
        return {
          employees: Array.isArray(parsed.employees) && parsed.employees.length > 0 ? parsed.employees : DEFAULT_EMPLOYEES,
          sessions: parsed.sessions,
          lastUpdated: parsed.lastUpdated || Date.now()
        };
      }
    }
  } catch (err) {
    console.error("Failed reading state from disk:", err);
  }
  const initial = {
    employees: DEFAULT_EMPLOYEES,
    sessions: [],
    lastUpdated: Date.now()
  };
  saveState(initial);
  return initial;
}
var serverState = loadState();
function reconcileServerSessions(local, remote) {
  const map = /* @__PURE__ */ new Map();
  let localUpdated = false;
  let remoteNeedsUpdate = false;
  for (const s of local) {
    map.set(s.id, { ...s });
  }
  for (const r of remote) {
    const l = map.get(r.id);
    if (!l) {
      map.set(r.id, { ...r });
      localUpdated = true;
    } else {
      let merged = { ...l };
      let changed = false;
      if (r.endTime !== null && l.endTime === null) {
        merged.endTime = r.endTime;
        merged.durationMinutes = r.durationMinutes;
        changed = true;
        localUpdated = true;
      } else if (l.endTime !== null && r.endTime === null) {
        remoteNeedsUpdate = true;
      }
      if (r.alarmPlayed && !l.alarmPlayed) {
        merged.alarmPlayed = true;
        changed = true;
        localUpdated = true;
      } else if (l.alarmPlayed && !r.alarmPlayed) {
        remoteNeedsUpdate = true;
      }
      if (r.warningPlayed && !l.warningPlayed) {
        merged.warningPlayed = true;
        changed = true;
        localUpdated = true;
      } else if (l.warningPlayed && !r.warningPlayed) {
        remoteNeedsUpdate = true;
      }
      if (r.overduePlayed && !l.overduePlayed) {
        merged.overduePlayed = true;
        changed = true;
        localUpdated = true;
      } else if (l.overduePlayed && !r.overduePlayed) {
        remoteNeedsUpdate = true;
      }
      if (changed) {
        map.set(r.id, merged);
      }
    }
  }
  const remoteIdSet = new Set(remote.map((r) => r.id));
  for (const s of local) {
    if (!remoteIdSet.has(s.id)) {
      remoteNeedsUpdate = true;
    }
  }
  return {
    merged: Array.from(map.values()),
    localUpdated,
    remoteNeedsUpdate
  };
}
var isServerPushing = false;
async function pullFromCloudHub() {
  try {
    const res = await fetch(CLOUD_SYNC_URL);
    if (!res.ok) {
      console.warn("Cloud hub fetch failed:", res.status);
      return;
    }
    const body = await res.json();
    if (body && body.data && Array.isArray(body.data.sessions)) {
      const cloudSessions = body.data.sessions;
      const { merged, localUpdated, remoteNeedsUpdate } = reconcileServerSessions(
        serverState.sessions,
        cloudSessions
      );
      if (localUpdated) {
        console.log(`[CloudSync] Updated local sessions from cloud: count=${merged.length}`);
        serverState.sessions = merged;
        serverState.lastUpdated = Date.now();
        fs.writeFileSync(DATA_FILE, JSON.stringify(serverState, null, 2), "utf-8");
        notifySseClients();
      }
      if (remoteNeedsUpdate && serverState.sessions.length > 0) {
        pushToCloudHub(serverState);
      }
    }
  } catch (err) {
    console.error("Cloud pull error:", err);
  }
}
async function pushToCloudHub(state) {
  if (isServerPushing) return;
  isServerPushing = true;
  try {
    const payload = {
      name: "InformaAlamSuteraStore",
      data: {
        sessions: state.sessions,
        lastUpdated: state.lastUpdated
      }
    };
    await fetch(CLOUD_SYNC_URL, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    fetch(NTFY_TOPIC_URL, {
      method: "POST",
      body: JSON.stringify({ type: "SYNC", lastUpdated: state.lastUpdated })
    }).catch(() => {
    });
  } catch (err) {
    console.error("Failed pushing to Cloud Hub:", err);
  } finally {
    isServerPushing = false;
  }
}
function saveState(state) {
  try {
    state.lastUpdated = Date.now();
    fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), "utf-8");
    notifySseClients();
    pushToCloudHub(state);
  } catch (err) {
    console.error("Failed writing state to disk:", err);
  }
}
pullFromCloudHub();
setInterval(pullFromCloudHub, 2500);
var sseClients = /* @__PURE__ */ new Set();
function notifySseClients() {
  const payload = JSON.stringify({
    type: "SYNC",
    lastUpdated: serverState.lastUpdated,
    sessionsCount: serverState.sessions.length,
    activeCount: serverState.sessions.filter((s) => s.endTime === null).length
  });
  for (const client of sseClients) {
    try {
      client.write(`data: ${payload}

`);
    } catch {
      sseClients.delete(client);
    }
  }
}
function getTodayString() {
  const now = /* @__PURE__ */ new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
async function startServer() {
  const app = express();
  app.use(express.json({ limit: "10mb" }));
  app.get("/api/events", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();
    sseClients.add(res);
    res.write(`data: ${JSON.stringify({ type: "CONNECTED", lastUpdated: serverState.lastUpdated })}

`);
    const keepAlive = setInterval(() => {
      res.write(": keepalive\n\n");
    }, 2e4);
    req.on("close", () => {
      clearInterval(keepAlive);
      sseClients.delete(res);
    });
  });
  app.get("/api/status", (req, res) => {
    res.json({
      status: "ok",
      timestamp: Date.now(),
      lastUpdated: serverState.lastUpdated,
      today: getTodayString(),
      activeBreaks: serverState.sessions.filter((s) => s.endTime === null).length
    });
  });
  app.get("/api/employees", (req, res) => {
    res.json(serverState.employees);
  });
  app.post("/api/employees", (req, res) => {
    const list = req.body;
    if (Array.isArray(list)) {
      serverState.employees = list;
      saveState(serverState);
      res.json({ success: true, count: list.length });
    } else {
      res.status(400).json({ success: false, message: "Invalid employees array" });
    }
  });
  app.get("/api/sessions", (req, res) => {
    const { today, nip } = req.query;
    let list = serverState.sessions;
    if (today === "1" || today === "true") {
      const todayStr = getTodayString();
      list = list.filter((s) => s.date === todayStr);
    }
    if (typeof nip === "string" && nip.trim()) {
      list = list.filter((s) => s.nip === nip.trim());
    }
    res.json(list);
  });
  app.post("/api/sessions/sync-all", (req, res) => {
    const { sessions } = req.body;
    if (Array.isArray(sessions)) {
      const { merged, localUpdated } = reconcileServerSessions(serverState.sessions, sessions);
      if (localUpdated) {
        serverState.sessions = merged;
        saveState(serverState);
      }
      return res.json({ success: true, count: serverState.sessions.length, sessions: serverState.sessions });
    }
    res.status(400).json({ success: false, message: "Invalid sessions payload" });
  });
  app.post("/api/sessions/start", (req, res) => {
    const { nip } = req.body;
    if (!nip) {
      return res.status(400).json({ success: false, message: "NIP wajib diisi." });
    }
    const cleanNip = String(nip).trim();
    const employee = serverState.employees.find(
      (e) => e.nip === cleanNip || !isNaN(parseInt(cleanNip, 10)) && parseInt(e.nip, 10) === parseInt(cleanNip, 10)
    );
    if (!employee) {
      return res.status(404).json({ success: false, message: "Karyawan tidak ditemukan." });
    }
    const today = getTodayString();
    const staffSessionsToday = serverState.sessions.filter((s) => s.nip === employee.nip && s.date === today);
    const active = staffSessionsToday.find((s) => s.endTime === null);
    if (active) {
      return res.status(400).json({
        success: false,
        message: "Anda sedang dalam sesi istirahat aktif! Selesaikan sesi ini terlebih dahulu.",
        session: active
      });
    }
    if (staffSessionsToday.length >= 2) {
      return res.status(400).json({
        success: false,
        message: "Batas istirahat harian tercapai! Anda sudah mengambil jatah 2x istirahat hari ini."
      });
    }
    const currentSessionNumber = staffSessionsToday.length + 1;
    const effectiveJobTitle = employee.jobTitle.toUpperCase() === "SALES EXECUTIVE" ? "SMT" : employee.jobTitle;
    const newSession = {
      id: "brk_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
      nip: employee.nip,
      employeeName: employee.name,
      jobTitle: effectiveJobTitle,
      department: employee.department,
      storeZone: "Informa Alam Sutera",
      date: today,
      startTime: Date.now(),
      endTime: null,
      durationMinutes: 0,
      sessionNumber: currentSessionNumber,
      alarmPlayed: false,
      warningPlayed: false,
      overduePlayed: false
    };
    serverState.sessions.push(newSession);
    saveState(serverState);
    const sessionLabel = currentSessionNumber === 1 ? "Istirahat Pertama (Sesi 1)" : "Istirahat Kedua (Sesi 2)";
    res.json({
      success: true,
      message: `${sessionLabel} berhasil dimulai!`,
      session: newSession
    });
  });
  app.post("/api/sessions/end", (req, res) => {
    const { nip, sessionId } = req.body;
    const today = getTodayString();
    const idx = serverState.sessions.findIndex((s) => {
      if (sessionId) return s.id === sessionId && s.endTime === null;
      if (nip) return s.nip === String(nip).trim() && s.date === today && s.endTime === null;
      return false;
    });
    if (idx === -1) {
      return res.status(404).json({
        success: false,
        message: "Tidak ditemukan sesi istirahat aktif untuk diselesaikan."
      });
    }
    const now = Date.now();
    const session = serverState.sessions[idx];
    const durationMs = now - session.startTime;
    const durationMinutes = Math.max(1, Math.round(durationMs / (1e3 * 60)));
    serverState.sessions[idx] = {
      ...session,
      endTime: now,
      durationMinutes
    };
    saveState(serverState);
    res.json({
      success: true,
      message: `Istirahat selesai! Durasi sesi: ${durationMinutes} menit.`,
      session: serverState.sessions[idx],
      durationMinutes
    });
  });
  app.post("/api/sessions/update-time", (req, res) => {
    const { sessionId, newStartTime, elapsedMinutes, resetAlarms } = req.body;
    if (!sessionId) {
      return res.status(400).json({ success: false, message: "Session ID diperlukan." });
    }
    const idx = serverState.sessions.findIndex((s) => s.id === sessionId);
    if (idx === -1) {
      return res.status(404).json({ success: false, message: "Sesi istirahat tidak ditemukan." });
    }
    const session = serverState.sessions[idx];
    const now = Date.now();
    let calculatedStartTime = session.startTime;
    if (typeof elapsedMinutes === "number") {
      calculatedStartTime = now - Math.round(elapsedMinutes * 60 * 1e3);
    } else if (typeof newStartTime === "number") {
      calculatedStartTime = newStartTime;
    }
    const currentElapsedSec = Math.floor((now - calculatedStartTime) / 1e3);
    let warningPlayed = session.warningPlayed;
    let alarmPlayed = session.alarmPlayed;
    let overduePlayed = session.overduePlayed;
    if (resetAlarms || currentElapsedSec < 35 * 60) {
      warningPlayed = false;
      alarmPlayed = false;
      overduePlayed = false;
    } else if (currentElapsedSec < 40 * 60) {
      alarmPlayed = false;
      overduePlayed = false;
    } else if (currentElapsedSec < 41 * 60) {
      overduePlayed = false;
    }
    serverState.sessions[idx] = {
      ...session,
      startTime: calculatedStartTime,
      warningPlayed,
      alarmPlayed,
      overduePlayed,
      durationMinutes: session.endTime ? Math.max(1, Math.round((session.endTime - calculatedStartTime) / 6e4)) : 0
    };
    saveState(serverState);
    res.json({
      success: true,
      message: `Waktu berhasil diperbarui! Berjalan ${Math.floor(currentElapsedSec / 60)}m ${currentElapsedSec % 60}s.`,
      session: serverState.sessions[idx]
    });
  });
  app.post("/api/sessions/mark-played", (req, res) => {
    const { sessionId, type } = req.body;
    const idx = serverState.sessions.findIndex((s) => s.id === sessionId);
    if (idx !== -1) {
      if (type === "warning") serverState.sessions[idx].warningPlayed = true;
      if (type === "alarm") serverState.sessions[idx].alarmPlayed = true;
      if (type === "overdue") serverState.sessions[idx].overduePlayed = true;
      saveState(serverState);
      return res.json({ success: true });
    }
    res.status(404).json({ success: false });
  });
  app.post("/api/sessions/reset-today", (req, res) => {
    const today = getTodayString();
    serverState.sessions = serverState.sessions.filter((s) => s.date !== today);
    saveState(serverState);
    res.json({ success: true, message: "Data istirahat hari ini berhasil direset." });
  });
  if (process.env.NODE_ENV === "production") {
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.resolve(distPath, "index.html"));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Informa Sync Server] Running on http://0.0.0.0:${PORT}`);
  });
}
startServer().catch((err) => {
  console.error("Fatal server startup error:", err);
  process.exit(1);
});
