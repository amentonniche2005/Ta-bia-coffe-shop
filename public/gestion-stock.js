// ============================================================================
// 🔒 SÉCURITÉ ET CONFIGURATION DE BASE
// ============================================================================
const monToken = localStorage.getItem('tabia_caisse_token');
if (!monToken) window.location.href = '/caisse-login.html';

async function fetchSecurise(url, options = {}) {
    if (!options.headers) options.headers = {};
    options.headers['authorization'] = monToken;
    options.headers['Content-Type'] = 'application/json';
    
    const reponse = await fetch(url, options);
    if (reponse.status === 403) {
        alert("Session expirée. Veuillez vous reconnecter.");
        localStorage.removeItem('tabia_caisse_token');
        window.location.href = '/caisse-login.html';
    }
    return reponse;
}

// Utilitaires de formatage
function formatMoney(amount) { return parseFloat(amount || 0).toFixed(3) + ' DT'; }
function escapeHtml(text) { if (!text) return text; const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }

// ============================================================================
//  NAVIGATION (ONGLETS)
// ============================================================================
function ouvrirOnglet(tabName) {
    // Cacher tous les panels
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    // Désactiver tous les boutons
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    
    // Activer la bonne vue
    const panelActif = document.getElementById(`panel-${tabName}`);
    if(panelActif) panelActif.classList.add('active');
    
    const btnActif = document.querySelector(`.tab[data-tab="${tabName}"]`);
    if(btnActif) btnActif.classList.add('active');

    // Charger les données appropriées
    if (tabName === 'stock') chargerStock();
    if (tabName === 'ventes') chargerRapportVentes();
    if (tabName === 'mouvements') chargerHistorique();
    if (tabName === 'alertes') chargerAlertes();
    if (tabName === 'depenses') chargerDepenses();
}

// ============================================================================
// 💰 LOGIQUE DES VENTES ET DU CHIFFRE D'AFFAIRES (CA)
// ============================================================================
let toutesLesVentes = [];
let ventesAffichees = []; // Stocké pour l'export CSV

function getIconPaiement(methode) {
    if(methode === 'en_ligne') return '<span class="badge" style="background:#e8f5e9; color:#27ae60;"><i class="fas fa-globe"></i> En Ligne</span>';
    if(methode === 'carte') return '<span class="badge" style="background:#f4e8f9; color:#8e44ad;"><i class="fas fa-credit-card"></i> Carte</span>';
    if(methode === 'ticket_resto') return '<span class="badge" style="background:#fef5e6; color:#e67e22;"><i class="fas fa-ticket-alt"></i> Ticket Resto</span>';
    if(methode === 'cheque') return '<span class="badge" style="background:#f1f5f9; color:#7f8c8d;"><i class="fas fa-money-check"></i> Chèque</span>';
    return '<span class="badge" style="background:#eef2f6; color:#34495e;"><i class="fas fa-money-bill-wave"></i> Espèces</span>';
}

async function chargerRapportVentes() {
    try {
        // 1. Récupérer toutes les ventes du serveur
        const res = await fetchSecurise('/api/ventes');
        toutesLesVentes = await res.json();
        
        // 2. Récupérer les valeurs des filtres
        const typeRapport = document.getElementById('typeRapport').value;
        const methodeFiltre = document.getElementById('filtreMethodeVente').value;
        const debutStr = document.getElementById('rapportDateDebut').value;
        const finStr = document.getElementById('rapportDateFin').value;
        
        // 3. Logique mathématique des dates (Gestion propre des heures)
        const tsDebut = debutStr ? new Date(debutStr + "T00:00:00").getTime() : 0;
        let tsFin = Infinity;
        if (finStr) {
            const dateFinObj = new Date(finStr + "T23:59:59");
            tsFin = dateFinObj.getTime();
        }

        // 4. Filtrage absolu et propre
        const ventesFiltrees = toutesLesVentes.filter(v => {
            const matchDate = v.timestamp >= tsDebut && v.timestamp <= tsFin;
            const methodeTicket = v.methodePaiement || 'especes'; // Valeur par défaut si ancienne donnée
            const matchMethode = methodeFiltre === 'all' || methodeTicket === methodeFiltre;
            
            return matchDate && matchMethode;
        });

        ventesAffichees = ventesFiltrees;

        // 5. Calcul des KPIs Globaux
        const totalCA = ventesFiltrees.reduce((sum, v) => sum + (parseFloat(v.total) || 0), 0);
        const nbTickets = ventesFiltrees.length;
        const panierMoyen = nbTickets > 0 ? (totalCA / nbTickets) : 0;

        document.getElementById('kpiCA').textContent = formatMoney(totalCA);
        document.getElementById('kpiTickets').textContent = nbTickets;
        document.getElementById('kpiMoyen').textContent = formatMoney(panierMoyen);

        // 6. Palmarès des Produits (Ce qui se vend le mieux)
        const statsProds = {};
        ventesFiltrees.forEach(ticket => {
            if(!ticket.articles) return;
            ticket.articles.forEach(art => {
                const nomComplet = art.nom + (art.variante ? ` (${art.variante})` : '');
                if (!statsProds[nomComplet]) statsProds[nomComplet] = { qte: 0, ca: 0 };
                statsProds[nomComplet].qte += parseInt(art.quantite || 1);
                statsProds[nomComplet].ca += (parseFloat(art.prix || 0) * parseInt(art.quantite || 1));
            });
        });

        const topProduits = Object.keys(statsProds)
            .map(nom => ({ nom, qte: statsProds[nom].qte, ca: statsProds[nom].ca }))
            .sort((a, b) => b.qte - a.qte); // Trier par quantité

        const tBodyProds = document.getElementById('rapportProduitsBody');
        if (topProduits.length === 0) {
            tBodyProds.innerHTML = '<tr><td colspan="3" class="empty-message">Aucune vente correspondante</td></tr>';
        } else {
            tBodyProds.innerHTML = topProduits.map(p => `
                <tr>
                    <td><strong>${escapeHtml(p.nom)}</strong></td>
                    <td style="text-align:center;"><span class="badge badge-neutral">${p.qte}</span></td>
                    <td style="text-align:right; font-weight:bold; color:var(--success);">${formatMoney(p.ca)}</td>
                </tr>
            `).join('');
        }

        // 7. Affichage Dynamique (Détails ou Synthèse)
        const tBodyTickets = document.getElementById('rapportTicketsBody');
        const enTete = document.getElementById('enTeteTableauDroite');
        const titreDroite = document.getElementById('titreTableauDroite');

        if (ventesFiltrees.length === 0) {
            enTete.innerHTML = '<tr><th>Données</th></tr>';
            tBodyTickets.innerHTML = '<tr><td class="empty-message">Aucune donnée pour ce filtre</td></tr>';
            return;
        }

        if (typeRapport === 'detail') {
            titreDroite.innerHTML = "🧾 Détail des Tickets Encaissés";
            enTete.innerHTML = '<tr><th>Date & Heure</th><th>Ticket & Mode</th><th style="text-align:right;">Total</th></tr>';
            
            tBodyTickets.innerHTML = ventesFiltrees.map(v => `
                <tr>
                    <td><div style="font-size:0.85rem; color:var(--text-muted);">${v.date}</div></td>
                    <td>
                        <strong>#${v.numero}</strong> <span style="font-size:0.75rem; color:var(--text-muted);">(${escapeHtml(v.tableOrigine)})</span><br>
                        <div style="margin-top:4px;">${getIconPaiement(v.methodePaiement)}</div>
                    </td>
                    <td style="font-weight:900; color:var(--success); text-align:right;">${formatMoney(v.total)}</td>
                </tr>
            `).join('');
        } else {
            // Groupement des ventes par Jour / Mois / Année
            const groupes = {};
            ventesFiltrees.forEach(v => {
                const businessDate = new Date(v.timestamp - 7200000); // Décale de 2h pour que les ventes de 1h du matin comptent pour la veille
                const jour = String(businessDate.getDate()).padStart(2, '0');
                const mois = String(businessDate.getMonth() + 1).padStart(2, '0');
                const annee = businessDate.getFullYear();
                
                let cle = '';
                if (typeRapport === 'jour') { cle = `${jour}/${mois}/${annee}`; titreDroite.innerHTML = "📅 Chiffre d'Affaires Quotidien"; }
                if (typeRapport === 'mois') { cle = `${mois}/${annee}`; titreDroite.innerHTML = "📆 Chiffre d'Affaires Mensuel"; }
                if (typeRapport === 'annee') { cle = `${annee}`; titreDroite.innerHTML = "📈 Chiffre d'Affaires Annuel"; }

                if (!groupes[cle]) groupes[cle] = { ca: 0, tickets: 0 };
                groupes[cle].ca += parseFloat(v.total);
                groupes[cle].tickets += 1;
            });

            enTete.innerHTML = '<tr><th>Période</th><th style="text-align:center;">Tickets</th><th style="text-align:right;">CA Période</th></tr>';
            
            tBodyTickets.innerHTML = Object.keys(groupes).map(cle => `
                <tr>
                    <td><strong>${cle}</strong></td>
                    <td style="text-align:center;"><span class="badge badge-neutral">${groupes[cle].tickets}</span></td>
                    <td style="text-align:right; font-weight:900; color:var(--success); font-size:1.1rem;">${formatMoney(groupes[cle].ca)}</td>
                </tr>
            `).join('');
        }
    } catch(e) { console.error("Erreur lors du chargement des ventes", e); }
}

function exporterVentesCSV() {
    if (ventesAffichees.length === 0) return alert("Aucune vente à exporter.");
    let csvContent = "data:text/csv;charset=utf-8,Ticket,Date,Origine,Mode Paiement,Montant (DT)\n";
    ventesAffichees.forEach(v => {
        csvContent += `${v.numero},${v.date.replace(/,/g, '')},${v.tableOrigine.replace(/,/g, '')},${v.methodePaiement || 'especes'},${v.total.toFixed(3)}\n`;
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Export_CA_TABIA_${new Date().getTime()}.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
}


// ============================================================================
// 📦 LOGIQUE DU STOCK & DASHBOARD (CARTES DU HAUT)
// ============================================================================
let tousLesProduits = [];

async function chargerDashboard() {
    try {
        const res = await fetchSecurise('/api/stock');
        tousLesProduits = await res.json();
        
        document.getElementById('totalProduits').innerText = tousLesProduits.length;
        
        let valStock = 0;
        let alertes = 0;
        
        // Remplir le dropdown des catégories pour le filtre
        const categoriesSet = new Set(tousLesProduits.map(p => p.categorie));
        const selectCat = document.getElementById('categorieFilter');
        if(selectCat.options.length === 1) {
            categoriesSet.forEach(cat => {
                if(cat) selectCat.add(new Option(cat, cat));
            });
        }

        tousLesProduits.forEach(p => {
            if (p.stock !== undefined) {
                valStock += (parseFloat(p.prix) * p.stock);
                if (p.stock <= p.seuilAlerte) alertes++;
            }
        });

        document.getElementById('valeurStock').innerText = formatMoney(valStock);
        document.getElementById('totalAlertes').innerText = alertes;
        
        const badge = document.getElementById('badgeAlertes');
        if (alertes > 0) { badge.innerText = "Critique"; badge.className = "badge badge-critical"; } 
        else { badge.innerText = "Normal"; badge.className = "badge badge-normal"; }

    } catch(e) { console.error("Erreur Dashboard", e); }
}

async function chargerStock() {
    await chargerDashboard();
    appliquerFiltresEtTriStock();
}

function appliquerFiltresEtTriStock() {
    const catFiltre = document.getElementById('categorieFilter').value;
    const etatFiltre = document.getElementById('etatFilter').value;
    const recherche = document.getElementById('searchFilter').value.toLowerCase();

    const produitsFiltres = tousLesProduits.filter(p => {
        const matchCat = catFiltre === 'all' || p.categorie === catFiltre;
        const matchRecherche = p.nom.toLowerCase().includes(recherche);
        let matchEtat = true;
        if (etatFiltre === 'alerte') matchEtat = p.stock !== undefined && p.stock <= p.seuilAlerte && p.stock > 0;
        if (etatFiltre === 'rupture') matchEtat = p.stock !== undefined && p.stock <= 0;
        if (etatFiltre === 'normal') matchEtat = p.stock === undefined || p.stock > p.seuilAlerte;
        
        return matchCat && matchRecherche && matchEtat;
    });

    const tbody = document.getElementById('stockTableBody');
    if (produitsFiltres.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-message">Aucun produit trouvé</td></tr>';
        return;
    }

    tbody.innerHTML = produitsFiltres.map(p => {
        let stockBadge = '<span class="badge badge-neutral">Service / Infini</span>';
        if (p.stock !== undefined) {
            if (p.stock <= 0) stockBadge = `<span class="badge badge-critical">Rupture (0)</span>`;
            else if (p.stock <= p.seuilAlerte) stockBadge = `<span class="badge badge-low">Alerte (${p.stock})</span>`;
            else stockBadge = `<span class="badge badge-normal">OK (${p.stock})</span>`;
        }
        
        return `
            <tr>
                <td><strong>${escapeHtml(p.nom)}</strong></td>
                <td><span style="color:var(--text-muted); font-size:0.8rem; text-transform:uppercase;">${p.categorie || 'Autre'}</span></td>
                <td>${stockBadge}</td>
                <td>${p.unite || 'Unité'}</td>
                <td style="font-weight:bold; color:var(--primary);">${formatMoney(p.prix)}</td>
                <td style="color:var(--text-muted);">${formatMoney((p.prix * 0.4))} <i style="font-size:10px">(Est.)</i></td>
                <td style="text-align:center;">
                    <button class="btn-action btn-warning" onclick="promptAjoutStock(${p.id}, '${escapeHtml(p.nom)}')"><i class="fas fa-plus"></i></button>
                </td>
            </tr>
        `;
    }).join('');
}

// Fonction rapide pour ajouter du stock
async function promptAjoutStock(id, nom) {
    const qteStr = prompt(`Fournisseur / Réception : Combien d'unités de "${nom}" voulez-vous ajouter au stock ?`);
    const qte = parseInt(qteStr);
    if (!isNaN(qte) && qte > 0) {
        try {
            await fetchSecurise(`/api/stock/${id}/add`, { method: 'POST', body: JSON.stringify({ quantite: qte, raison: "Réception Fournisseur" }) });
            chargerStock();
            chargerHistorique(); // Mets à jour les mouvements
        } catch(e) { alert("Erreur lors de l'ajout."); }
    }
}


// ============================================================================
// 🔄 MOUVEMENTS, ALERTES & DÉPENSES (Moteurs de base)
// ============================================================================
async function chargerHistorique() {
    try {
        const res = await fetchSecurise('/api/stock/historique');
        let mvt = await res.json();
        
        // Filtres basiques
        const typeFiltre = document.getElementById('mouvementType') ? document.getElementById('mouvementType').value : 'all';
        if(typeFiltre !== 'all') mvt = mvt.filter(m => m.type === typeFiltre);

        const tbody = document.getElementById('historiqueBody');
        if(!tbody) return;

        if(mvt.length === 0) { tbody.innerHTML = '<tr><td colspan="7" class="empty-message">Aucun mouvement</td></tr>'; return; }

        tbody.innerHTML = mvt.map(m => {
            let color = "var(--text-main)";
            let sign = "";
            let icon = "";
            if (m.type === 'vente' || m.type === 'vente_web') { color = "var(--danger)"; sign = "-"; icon = "📉 Sortie"; }
            if (m.type === 'ajout') { color = "var(--success)"; sign = "+"; icon = "📈 Entrée"; }
            
            return `
            <tr>
                <td style="font-size:0.85rem; color:var(--text-muted);">${m.date}</td>
                <td><strong>${icon}</strong></td>
                <td><strong>${escapeHtml(m.produit)}</strong></td>
                <td style="text-align:center; color:${color}; font-weight:bold;">${sign}${m.quantite}</td>
                <td style="text-align:center;">${m.ancienStock !== undefined ? m.ancienStock : '-'}</td>
                <td style="text-align:center;">${m.nouveauStock !== undefined ? m.nouveauStock : '-'}</td>
                <td style="font-size:0.8rem; color:var(--text-muted);">${m.raison || ''}</td>
            </tr>`;
        }).join('');
    } catch(e) {}
}

async function chargerAlertes() {
    try {
        if(tousLesProduits.length === 0) {
            const res = await fetchSecurise('/api/stock');
            tousLesProduits = await res.json();
        }
        const tbody = document.getElementById('alertesContainerBody');
        if(!tbody) return;

        const alertes = tousLesProduits.filter(p => p.stock !== undefined && p.stock <= p.seuilAlerte);
        
        if (alertes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="empty-message"><i class="fas fa-check-circle" style="font-size:2rem; color:var(--success); display:block; margin-bottom:10px;"></i>Aucune alerte, stock sain !</td></tr>';
            return;
        }

        tbody.innerHTML = alertes.map(p => `
            <tr style="background: ${p.stock <= 0 ? '#fff5f5' : '#fffbeb'};">
                <td style="color:var(--danger); font-weight:bold;"><i class="fas fa-exclamation-circle"></i> Alerte Active</td>
                <td><strong>${escapeHtml(p.nom)}</strong></td>
                <td><span class="badge ${p.stock <= 0 ? 'badge-critical' : 'badge-low'}">${p.stock} unités</span></td>
                <td>${p.seuilAlerte}</td>
                <td style="text-align:right;">
                    <button class="btn-action btn-success" onclick="promptAjoutStock(${p.id}, '${escapeHtml(p.nom)}')"><i class="fas fa-truck"></i> Commander</button>
                </td>
            </tr>
        `).join('');
    } catch(e) {}
}

// ============================================================================
// 🚀 INITIALISATION DU FICHIER & WEBSOCKET
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
    // 1. Charger les données par défaut au démarrage
    chargerDashboard();
    chargerStock();
    chargerRapportVentes();

    // 2. Initialiser les Sockets pour le Temps Réel
    const socket = io({ 
        auth: { token: monToken }, 
        transports: ['websocket', 'polling'], 
        reconnection: true 
    });

    socket.on('update_stock', () => {
        // Si le serveur dit que le stock a changé (Vente Cuisine ou Webhook Konnect)
        chargerStock(); 
        chargerRapportVentes();
        chargerHistorique();
        chargerAlertes();
    });
});