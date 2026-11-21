import { CATEGORY_CATALOG } from './categoryCatalog.js';

// Complete offline Italian category catalogue. Arrays follow CATEGORY_CATALOG order.
const names = [
  'Videogiochi','Cinema e TV','Musica','Sport','Tecnologia','Internet e social media','Anime e manga','Supereroi e fumetti','Geografia','Storia','Spazio','Scienza','Auto e motorsport','Animali e natura','Cibo e bevande','Arte e design','Libri e racconti','Cultura e stile di vita','Marchi e imprese','Mitologia e leggende','Viaggi e turismo','Istruzione e matematica','Moda e bellezza'
];
const subtitles = [
  'Mondi creati per giocare.','Storie su ogni schermo.','Trova il tuo ritmo.','Record, rivali e leggende.','Idee che plasmano il futuro.','La cultura del mondo connesso.','Storie oltre la realtà.','Eroi, cattivi e universi.','Esplora il mondo.','Il passato, decifrato.','Oltre il nostro mondo.','Scopri come funzionano le cose.','Macchine progettate per la velocità.','La vita in ogni sua forma.','Assapora il mondo.','Creatività in ogni dettaglio.','Mondi fatti di parole.','Come le persone vivono e festeggiano.','Nomi, idee e mercati.','Dèi, eroi e racconti antichi.','Luoghi da scoprire.','Pensa, risolvi e impara.','Stile, espressione e creatività.'
];
const subcategories = [
  ['Giochi famosi','Personaggi dei videogiochi','Sport elettronici','Studi di sviluppo','Storia dei videogiochi'],
  ['Film','Serie TV','Attori','Personaggi','Premi'],
  ['Pop','Rock','Hip-hop e rap','K-pop','Artisti e gruppi'],
  ['Calcio','Pallacanestro','Sport da combattimento','Competizioni mondiali','Atleti famosi'],
  ['Intelligenza artificiale','Dispositivi mobili e gadget','Computer','Internet','Aziende tecnologiche'],
  ['YouTube','Streamer','Social network','Meme popolari','Tendenze di Internet'],
  ['Serie anime','Personaggi','Manga','Studi','Cultura giapponese'],
  ['Marvel','DC','Supereroi','Fumetti','Antieroi'],
  ['Paesi','Città','Bandiere','Monumenti','Meraviglie del mondo'],
  ['Civiltà','Regni','Guerre','Rivoluzioni','Personaggi storici'],
  ['Sistema solare','Pianeti','Missioni spaziali','Agenzie spaziali','Scoperte'],
  ['Fisica','Chimica','Biologia','Invenzioni','Scienziati'],
  ['Marche automobilistiche','Supercar','Motociclette','Formula 1','Corse automobilistiche'],
  ['Animali','Oceani','Foreste','Natura','Record degli animali'],
  ['Cucine del mondo','Fast food','Dolci','Bevande','Marchi alimentari'],
  ['Pittura','Architettura','Fotografia','Design','Opere d’arte famose'],
  ['Romanzi','Autori','Fantasy','Fantascienza','Personaggi immaginari'],
  ['Culture nazionali','Festival','Tradizioni','Moda','Stile di vita'],
  ['Marchi globali','Aziende','Startup','Imprenditori','Commercio'],
  ['Mitologia greca','Mitologia norrena','Mitologia egizia','Mitologia iraniana','Mitologie del mondo'],
  ['Destinazioni','Attrazioni famose','Città panoramiche','Hotel','Avventure e luoghi speciali'],
  ['Matematica','Enigmi logici','Calcolo mentale','Cultura generale','Sfide di ragionamento'],
  ['Abbigliamento e moda','Marchi di moda','Trucco e bellezza','Stile personale','Tendenze e stilisti']
];
const categoryNames = Object.fromEntries(CATEGORY_CATALOG.map((item, i) => [item.id, names[i]]));
const categorySubtitles = Object.fromEntries(CATEGORY_CATALOG.map((item, i) => [item.id, subtitles[i]]));
const categorySubcategories = Object.fromEntries(CATEGORY_CATALOG.map((item, i) => [
  item.id, Object.fromEntries(item.subcategories.map((id, j) => [id, subcategories[i][j]]))
]));
Object.assign(categoryNames, { memory:'Memoria', logic:'Logica', mathematics:'Matematica', knowledge:'Cultura generale', reaction:'Riflessi', focus:'Concentrazione', language:'Lingua', science:'Scienza' });
Object.assign(categorySubtitles, {
  memory:'Ricorda il segnale.', logic:'Trova il punto debole.', mathematics:'I numeri non mentono.',
  knowledge:'Impara di più. Agisci in fretta.', reaction:'Scegli sotto pressione.',
  focus:'Elimina le distrazioni.', language:'Leggi tra le righe.', science:'Decifra il mondo naturale.'
});
export const EXTRA_CATEGORY_TRANSLATIONS = Object.freeze({
  it: Object.freeze({ categoryNames, categorySubtitles, categorySubcategories })
});
