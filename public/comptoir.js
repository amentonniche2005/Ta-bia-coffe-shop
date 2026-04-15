// ========== SÉCURITÉ : VÉRIFICATION DU TOKEN ==========
const monToken = localStorage.getItem('tabia_caisse_token');

if (!monToken) {
    window.location.href = '/caisse-login.html'; 
}

async function fetchSecurise(url, options = {}) {
    if (!options.headers) options.headers = {};
    options.headers['authorization'] = monToken; 
    options.headers['Content-Type'] = 'application/json';
    
    const reponse = await fetch(url, options);
    if (reponse.status === 403) {
        alert("Votre Token a expiré ou a été révoqué.");
        localStorage.removeItem('tabia_caisse_token');
        window.location.href = '/caisse-login.html';
    }
    return reponse;
}

// ========== COMPTOIR AVEC SOCKET.IO - LOGIQUE KDS ==========
let filtreActuel = "all";
let commandesComptoirCache = [];
let vueActuelle = "commandes"; // Peut être "commandes" ou "synthese"
async function chargerCommandes() {
    try {
        const response = await fetchSecurise('/api/commandes');
        const commandes = await response.json();
        // 🔥 MODIFICATION : On garde les commandes "livree" en mémoire, on ne supprime que les "paye"
        commandesComptoirCache = commandes.filter(c => c.statut !== 'paye');
        afficherCommandes();
    } catch (error) {
        afficherNotification("❌ Erreur de chargement des commandes", "error");
    }
}

// ========== ACTIONS ==========
async function demarrerPreparation(id) {
    try {
        const response = await fetchSecurise(`/api/commandes/${id}/statut`, {
            method: 'PUT', body: JSON.stringify({ statut: 'en_preparation' })
        });
        if (response.ok) jouerSonAction();
    } catch (error) { afficherNotification("❌ Erreur réseau", "error"); }
}

async function terminerCommande(id) {
    try {
        const response = await fetchSecurise(`/api/commandes/${id}/statut`, {
            method: 'PUT', body: JSON.stringify({ statut: 'terminee' })
        });
        if (response.ok) jouerSonAction();
    } catch (error) { afficherNotification("❌ Erreur réseau", "error"); }
}

// 🔥 NOUVEAU : Archiver la commande une fois servie au client (Nettoie l'écran)
async function archiverCommande(id) {
    try {
        const response = await fetchSecurise(`/api/commandes/${id}/statut`, {
            method: 'PUT', body: JSON.stringify({ statut: 'livree' })
        });
        if (response.ok) {
            commandesComptoirCache = commandesComptoirCache.filter(c => String(c.id) !== String(id));
            afficherCommandes();
            jouerSonAction();
            afficherNotification("✅ Commande servie et archivée !", "success");
        }
    } catch (error) { afficherNotification("❌ Erreur réseau", "error"); }
}

window.annulerTerminee = async function(id) {
    try {
        const response = await fetchSecurise(`/api/commandes/${id}/statut`, {
            method: 'PUT', body: JSON.stringify({ statut: 'en_preparation' })
        });
        if (response.ok) {
            jouerSonAction();
            afficherNotification("🔙 Commande remise en préparation !", "info");
        }
    } catch (error) { afficherNotification("❌ Erreur réseau", "error"); }
};

// ========== SOCKET.IO ==========
let socket = null;

function initSocket() {
    socket = io({ 
        auth: { token: monToken }, 
        transports: ['websocket', 'polling'], 
        reconnection: true 
    });
    
    socket.on('connect', () => {
        document.getElementById('onlineStatus').textContent = '🟢';
        afficherNotification('Connexion au serveur rétablie', 'success');
    });
    
    socket.on('disconnect', () => {
        document.getElementById('onlineStatus').textContent = '🔴';
        afficherNotification('⚠️ Déconnecté du serveur', 'warning');
    });
    
    socket.on('nouvelle_commande', (commande) => {
        commandesComptoirCache.push(commande);
        afficherCommandes();
        jouerSonNouvelleCommande();
        
        const nomAlerte = commande.clientName ? commande.clientName : `Commande #${commande.numero}`;
        afficherNotification(`📢 Nouvelle : ${nomAlerte}`, "info");
        
        setTimeout(() => {
            const el = document.querySelector(`.ticket[data-id="${commande.id}"]`);
            if(el) el.style.animation = 'flash 1s ease';
        }, 50);
    });
    
socket.on('mise_a_jour_commande', (commande) => {
    // ✅ BON CODE : La commande ne disparaît de la cuisine QUE si elle est servie
    const index = commandesComptoirCache.findIndex(c => c.id === commande.id);
    
    if (commande.statutCuisine === 'servi') {
        if (index !== -1) commandesComptoirCache.splice(index, 1); // Disparaît de la cuisine
    } else {
        if (index !== -1) commandesComptoirCache[index] = commande;
        else commandesComptoirCache.push(commande); // Reste à l'écran
    }
    afficherCommandes();
});
    
    socket.on('suppression_commande', (id) => {
        commandesComptoirCache = commandesComptoirCache.filter(c => String(c.id) !== String(id));
        afficherCommandes();
    });
}

// ========== AFFICHAGE (Rendu HTML) ==========
function afficherCommandes() {
    const enAttente = commandesComptoirCache.filter(c => c.statut === 'en_attente');
    const enPreparation = commandesComptoirCache.filter(c => c.statut === 'en_preparation');
    const terminees = commandesComptoirCache.filter(c => c.statut === 'terminee');
    
    enAttente.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    enPreparation.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    terminees.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    
    afficherColonne("commandesAttente", enAttente, "attente");
    afficherColonne("commandesPreparation", enPreparation, "preparation");
    afficherColonne("commandesTerminees", terminees, "terminee");
    
    document.getElementById("nbAttente").textContent = enAttente.length;
    document.getElementById("nbPreparation").textContent = enPreparation.length;
    
    if (vueActuelle === "synthese") {
        afficherSynthese();
    }
}

function afficherColonne(containerId, commandes, type) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    let commandesFiltrees = commandes;
    
    if (filtreActuel !== "all") {
        commandesFiltrees = commandes.filter(cmd => {
            if (filtreActuel === "fidele") return cmd.clientName != null;
            if (filtreActuel === "client") return cmd.clientId != null && cmd.clientName == null;
            if (filtreActuel === "comptoir") return cmd.clientId == null && cmd.clientName == null;
            return true;
        });
    }
    
    if (commandesFiltrees.length === 0) {
        container.innerHTML = `<div class='empty-col'><i class="fas fa-clipboard-check"></i><p>Aucune commande</p></div>`;
        return;
    }
    
    container.innerHTML = commandesFiltrees.map(cmd => {
        const timeStr = cmd.date ? cmd.date.split(' ')[1] : new Date(cmd.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        const nomAffiche = cmd.clientName ? `<i class="fas fa-star"></i> ${escapeHtml(cmd.clientName)}` : `#${cmd.numero}`;
        const colorTitre = cmd.clientName ? 'color:#ea580c; font-size:1.2rem;' : ''; 
        const textTable = (cmd.numeroTable === 'Emporter' || !cmd.numeroTable) ? 'À Emporter' : `Table ${cmd.numeroTable}`;
        
        const badgeTable = cmd.clientName 
            ? `<span class="badge" style="background:#fef5e6; color:#e67e22; border:1px solid #fed7aa;"><i class="fas fa-star"></i> Fidèle - ${textTable}</span>` 
            : `<span class="badge badge-table"><i class="fas fa-chair"></i> ${textTable}</span>`;
        
        const badgeOrigine = cmd.clientId && !cmd.clientName 
            ? `<span class="badge badge-client"><i class="fas fa-mobile-alt"></i> Web</span>` : ``;

        const estPaye = (cmd.methodePaiement === 'en_ligne' || cmd.methodePaiement === 'carte_fidelite' || cmd.methodePaiement === 'Carte Fidélité');
        
        const badgePaiement = estPaye
            ? `<span class="badge" style="background:#dcfce7; color:#166534; border:1px solid #bbf7d0;"><i class="fas fa-check-circle"></i> Payé</span>`
            : `<span class="badge" style="background:#fee2e2; color:#b91c1c; border:1px solid #fecaca;"><i class="fas fa-hand-holding-usd"></i> À encaisser</span>`;

        let slaHtml = '';
        if (cmd.statut !== 'terminee') {
            const sla = getSLAInfo(cmd.timestamp);
            slaHtml = `<div id="sla-${cmd.id}" class="sla-badge ${sla.class}" data-timestamp="${cmd.timestamp}">
                         <i class="fas ${sla.icon}"></i> <span>${sla.text}</span>
                       </div>`;
        }

        const itemsHtml = cmd.articles.map(a => `
            <li class="item-row">
                <div class="item-qty">${parseInt(a.quantite || 1)}</div>
                <div class="item-name">${escapeHtml(a.nom)} ${a.variante ? `<span style="display:block; font-size:0.8rem; color:#64748b; font-weight:normal;">(${escapeHtml(a.variante)})</span>` : ''}</div>
            </li>
        `).join('');

        // 🔥 CORRECTION : Ajout des GUILLEMETS autour de '${cmd.id}' pour éviter les erreurs ReferenceError
        return `
            <div class="ticket" data-id="${cmd.id}" onclick="voirDetails('${cmd.id}')">
                <div class="ticket-header">
                    <span class="ticket-id" style="${colorTitre}">${nomAffiche}</span>
                    <div class="ticket-time-container">
                        <span class="ticket-time"><i class="far fa-clock"></i> ${timeStr}</span>
                        ${slaHtml} 
                    </div>
                </div>
                <div class="badges-row">
                    ${badgeTable} ${badgeOrigine} ${badgePaiement} 
                </div>
                <ul class="items-list">
                    ${itemsHtml}
                </ul>
                <div class="ticket-actions">
                    <button class="btn-action" style="background:#64748b; flex: 0.3;" onclick="event.stopPropagation(); imprimerTicket('${cmd.id}')">
                        <i class="fas fa-print"></i>
                    </button>
                    ${getBoutonsAction(cmd, type)}
                </div>
            </div>
        `;
    }).join('');
}

function getBoutonsAction(cmd, type) {
    if (type === "attente") {
        return `<button class="btn-action btn-start" onclick="event.stopPropagation(); demarrerPreparation('${cmd.id}')"><i class="fas fa-fire"></i> Préparer</button>`;
    } else if (type === "preparation") {
        return `<button class="btn-action btn-finish" onclick="event.stopPropagation(); terminerCommande('${cmd.id}')"><i class="fas fa-check-double"></i> Terminer</button>`;
    } else if (type === "terminee") {
        // 🔥 CORRECTION : Boutons d'archivage clairs pour nettoyer l'écran
        return `
            <button class="btn-action" style="background:#ef4444; flex:0.4;" onclick="event.stopPropagation(); annulerTerminee('${cmd.id}')" title="Retourner en préparation"><i class="fas fa-undo"></i></button>
            <button class="btn-action btn-finish" style="flex:1; background:#10b981;" onclick="event.stopPropagation(); archiverCommande('${cmd.id}')"><i class="fas fa-check-circle"></i> Servi (Archiver)</button>
        `;
    }
    return "";
}

// ========== MODAL DÉTAILS ==========
function voirDetails(id) {
    const cmd = commandesComptoirCache.find(c => String(c.id) === String(id));
    if (!cmd) return;
    
    document.getElementById("modalTitle").textContent = cmd.clientName ? `Détails de ${escapeHtml(cmd.clientName)}` : `Commande #${cmd.numero}`;
    
    const textTable = (cmd.numeroTable === 'Emporter' || !cmd.numeroTable) ? 'À Emporter' : `Table ${cmd.numeroTable}`;
    const estPaye = (cmd.methodePaiement === 'en_ligne' || cmd.methodePaiement === 'carte_fidelite' || cmd.methodePaiement === 'Carte Fidélité');

    let html = `
        <div style="margin-bottom: 1.5rem; background: #f8fafc; padding: 1rem; border-radius: 12px; border: 1px solid #e2e8f0;">
            <div style="margin-bottom:0.5rem; font-size: 1.1rem;">
                <strong><i class="fas fa-map-marker-alt"></i> Destination :</strong> 
                ${cmd.clientName ? `<span style="color:#e67e22; font-weight:bold;">🌟 Fidèle (${escapeHtml(cmd.clientName)}) - ${textTable}</span>` : textTable}
            </div>
            <div style="margin-bottom:0.5rem;"><strong><i class="fas fa-compass"></i> Origine :</strong> ${cmd.clientId ? 'Client Web (Mobile)' : 'Caisse / Serveur'}</div>
            
            <div style="margin-bottom:0.5rem;">
                <strong><i class="fas fa-wallet"></i> Paiement :</strong> 
                ${estPaye 
                    ? '<span style="color:#166534; font-weight:bold; background:#dcfce7; padding:2px 8px; border-radius:10px;">✅ Déjà payé (En Ligne / Wallet)</span>' 
                    : '<span style="color:#b91c1c; font-weight:bold; background:#fee2e2; padding:2px 8px; border-radius:10px;">⚠️ À encaisser à la caisse</span>'}
            </div>

            <div><strong><i class="far fa-clock"></i> Heure :</strong> ${cmd.date || new Date(cmd.timestamp).toLocaleString()}</div>
        </div>
        <h3 style="font-size: 1.1rem; margin-bottom: 1rem; border-bottom: 2px solid #e2e8f0; padding-bottom: 0.5rem;">Articles à préparer</h3>
        <div style="border-radius: 10px;">
            ${cmd.articles.map(a => `
                <div style="display:flex; justify-content:space-between; align-items: center; margin-bottom:0.8rem; font-weight:700; font-size: 1.1rem;">
                    <div style="display: flex; gap: 10px; align-items: center;">
                        <span style="background: #e2e8f0; padding: 4px 10px; border-radius: 6px;">${parseInt(a.quantite || 1)}x</span>
                        <span>${escapeHtml(a.nom)} ${a.variante ? `<i style="color:#64748b; font-size:0.9rem;">(${escapeHtml(a.variante)})</i>` : ''}</span>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
    
    document.getElementById("modalBody").innerHTML = html;
    document.getElementById("modalDetails").style.display = "flex";
}

function fermerModal(event) {
    if(event && event.target.id !== 'modalDetails') return;
    document.getElementById("modalDetails").style.display = "none";
}

function escapeHtml(text) { 
    if (!text) return text; 
    const div = document.createElement('div'); div.textContent = text; return div.innerHTML; 
}

// ========== UTILITAIRES ==========
function changerFiltre(filtre) {
    filtreActuel = filtre;
    document.querySelectorAll(".filtre-btn").forEach(btn => btn.classList.remove("active"));
    event.target.classList.add("active");
    afficherCommandes();
}

function rafraichirCommandes() {
    chargerCommandes();
    afficherNotification("🔄 Synchronisation effectuée", "info");
}

function afficherNotification(msg, type = "info") {
    const notif = document.createElement("div");
    notif.style.cssText = `
        position: fixed; bottom: 30px; right: 30px; color: white;
        padding: 1rem 1.5rem; border-radius: 12px; z-index: 9999; 
        font-weight: 600; box-shadow: 0 10px 25px rgba(0,0,0,0.2);
        animation: slideInRight 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); 
        background: ${type === 'error' ? '#e74c3c' : (type === 'success' ? '#10b981' : '#3b82f6')};
    `;
    notif.innerHTML = msg;
    document.body.appendChild(notif);
    setTimeout(() => { 
        notif.style.transform = 'translateX(120%)'; 
        setTimeout(() => notif.remove(), 300); 
    }, 3000);
}

// ========== SONS ==========
function jouerSonNouvelleCommande() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine'; osc.frequency.setValueAtTime(800, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.3, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start(); osc.stop(ctx.currentTime + 0.3);
    } catch(e) {}
}

function jouerSonAction() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'triangle'; osc.frequency.setValueAtTime(400, ctx.currentTime);
        gain.gain.setValueAtTime(0.2, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
        osc.start(); osc.stop(ctx.currentTime + 0.1);
    } catch(e) {}
}

// ========== CALCUL DU TEMPS D'ATTENTE (SLA) ==========
function getSLAInfo(timestamp) {
    const now = Date.now();
    const diffMs = now - parseInt(timestamp || now, 10);
    const diffMins = Math.floor(diffMs / 60000);

    let slaClass = 'sla-good';
    let icon = 'fa-check-circle';

    if (diffMins >= 10) {
        slaClass = 'sla-danger';
        icon = 'fa-fire';
    } else if (diffMins >= 5) {
        slaClass = 'sla-warning';
        icon = 'fa-exclamation-triangle';
    }

    return { class: slaClass, text: `${diffMins} min`, icon: icon, minutes: diffMins };
}

// ========== CHRONOMÈTRE FLUIDE EN TEMPS RÉEL ==========
function demarrerChronoFluid() {
    setInterval(() => {
        const slaBadges = document.querySelectorAll('.sla-badge');
        
        slaBadges.forEach(badge => {
            const timestamp = parseInt(badge.getAttribute('data-timestamp'), 10);
            if (!timestamp) return;

            const sla = getSLAInfo(timestamp);
            
            const textSpan = badge.querySelector('span');
            if (textSpan && textSpan.innerText !== sla.text) {
                textSpan.innerText = sla.text;
            }

            const icon = badge.querySelector('i');
            if (icon && !icon.classList.contains(sla.icon)) {
                icon.className = `fas ${sla.icon}`;
            }

            if (!badge.classList.contains(sla.class)) {
                badge.classList.remove('sla-good', 'sla-warning', 'sla-danger');
                badge.classList.add(sla.class);
            }
        });
    }, 1000); 
}

// ========== LOGIQUE VUE SYNTHÈSE (PRODUCTION GROUPÉE) ==========
window.basculerVue = function(vue) {
    vueActuelle = vue;
    
    document.getElementById('btnVueCommandes').classList.toggle('active', vue === 'commandes');
    document.getElementById('btnVueSynthese').classList.toggle('active', vue === 'synthese');
    
    if (vue === 'commandes') {
        document.getElementById('commandesContainer').style.display = 'flex';
        document.getElementById('syntheseContainer').style.display = 'none';
        afficherCommandes();
    } else {
        document.getElementById('commandesContainer').style.display = 'none';
        document.getElementById('syntheseContainer').style.display = 'block';
        afficherSynthese();
    }
};

function afficherSynthese() {
    const container = document.getElementById('syntheseContainer');
    if (!container) return;

    const produitsAGrouper = {};

    commandesComptoirCache.forEach(cmd => {
        if (cmd.statut === 'en_attente' || cmd.statut === 'en_preparation') {
            
            let conserver = true;
            if (filtreActuel === "fidele" && !cmd.clientName) conserver = false;
            if (filtreActuel === "client" && (!cmd.clientId || cmd.clientName)) conserver = false;
            if (filtreActuel === "comptoir" && (cmd.clientId || cmd.clientName)) conserver = false;

            if (conserver) {
                cmd.articles.forEach(art => {
                    const cle = `${art.nom}_${art.variante || 'standard'}`;
                    
                    if (!produitsAGrouper[cle]) {
                        produitsAGrouper[cle] = { nom: art.nom, variante: art.variante, quantite: 0 };
                    }
                    // 🔥 CORRECTION : Empêche l'addition de textes ("1"+"2"="12")
                    produitsAGrouper[cle].quantite += parseInt(art.quantite || 1, 10);
                });
            }
        }
    });

    const tableauSynthese = Object.values(produitsAGrouper).sort((a, b) => b.quantite - a.quantite);

    if (tableauSynthese.length === 0) {
        container.innerHTML = `<div class='empty-col' style='margin-top:5rem;'><i class="fas fa-mug-hot" style="font-size:5rem;"></i><p>Aucun produit en cours de production</p></div>`;
        return;
    }

    container.innerHTML = `
        <h2 style="margin-bottom: 2rem; color: #1e293b; font-size: 2rem; font-weight: 800;"><i class="fas fa-layer-group"></i> Production Groupée en cours</h2>
        <div class="synthese-grid">
            ${tableauSynthese.map(item => `
                <div class="synthese-card">
                    <div class="synthese-qty">${item.quantite}</div>
                    <div>
                        <div class="synthese-name">${escapeHtml(item.nom)}</div>
                        ${item.variante ? `<span class="synthese-variant">${escapeHtml(item.variante)}</span>` : ''}
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

// ========== ANIMATION CSS DYNAMIQUE ==========
const style = document.createElement('style');
style.textContent = `
    @keyframes flash { 0% { background: #fef08a; transform: scale(1.02); } 100% { background: white; transform: scale(1); } }
    @keyframes slideInRight { from { transform: translateX(120%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
`;
document.head.appendChild(style);

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('Service Worker activé sur cette application !'))
            .catch(err => console.log('Erreur Service Worker', err));
    });
}

// ========== INIT ==========
document.addEventListener("DOMContentLoaded", () => {
    initSocket();
    chargerCommandes();
    demarrerChronoFluid();
});

window.demarrerPreparation = demarrerPreparation;
window.terminerCommande = terminerCommande;
window.archiverCommande = archiverCommande;
window.voirDetails = voirDetails;
window.fermerModal = fermerModal;
window.rafraichirCommandes = rafraichirCommandes;
window.changerFiltre = changerFiltre;

// ========== FONCTION IMPRESSION TICKET (DESIGN CAISSE STANDARD) ==========
window.imprimerTicket = function(id) {
    const cmd = commandesComptoirCache.find(c => String(c.id) === String(id));
    if (!cmd) {
        afficherNotification("Commande introuvable pour l'impression", "error");
        return;
    }

    const zonePrint = document.getElementById('ticket-impression');
    if (!zonePrint) return;

    const dateObj = new Date(cmd.timestamp || Date.now());
    const dateStr = dateObj.toLocaleDateString('fr-FR');
    const timeStr = dateObj.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    
    let nomOrigine = (cmd.numeroTable === 'Emporter' || !cmd.numeroTable) ? "📦 Emporter" : `Table ${cmd.numeroTable}`;
    if (cmd.clientName) nomOrigine = `Fidèle : ${cmd.clientName}`;
    const estPaye = (cmd.methodePaiement === 'en_ligne' || cmd.methodePaiement === 'carte_fidelite' || cmd.methodePaiement === 'Carte Fidélité');

    let articlesHTML = cmd.articles.map(a => `
        <div style="display: flex; justify-content: space-between; font-family: 'Courier New', Courier, monospace; font-size: 14px; font-weight: bold; margin-bottom: 4px;">
            <div style="flex: 1;">${parseInt(a.quantite || 1)}x ${escapeHtml(a.nom).toUpperCase()}</div>
            <div style="width: 70px; text-align: right;">${(parseFloat(a.prix) * parseInt(a.quantite || 1)).toFixed(2)}</div>
        </div>
        ${a.variante ? `<div style="font-family: 'Courier New', Courier, monospace; font-size: 12px; margin-left: 15px; margin-bottom: 6px;">> ${escapeHtml(a.variante)}</div>` : ''}
    `).join('');

    zonePrint.style.display = 'block';
    zonePrint.innerHTML = `
        <div style="width: 100%; max-width: 80mm; margin: 0 auto; color: #000; font-family: 'Courier New', Courier, monospace; background: #fff; padding: 0;">
            <div style="text-align: center; margin-bottom: 10px;">
                <h2 style="margin: 0; font-size: 22px; font-weight: bold;">TA'BIA COFFEE</h2>
                <p style="margin: 5px 0 0 0; font-size: 12px;">Ticket Cuisine / Préparation</p>
            </div>
            <div style="border-top: 1px dashed #000; margin: 10px 0;"></div>
            <div style="font-size: 13px; line-height: 1.5;">
                <div style="display: flex; justify-content: space-between;">
                    <span><b>TICKET:</b> #${cmd.numero || cmd.id}</span>
                    <span>${dateStr} ${timeStr}</span>
                </div>
                <div><b>ORIGINE:</b> ${nomOrigine}</div>
                <div><b>STATUT:</b> ${estPaye ? 'DÉJÀ PAYÉ' : 'À ENCAISSER'}</div>            
            </div>
            <div style="border-top: 1px dashed #000; margin: 10px 0;"></div>
            <div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: bold; margin-bottom: 5px;">
                <div style="flex: 1;">QTE x DESIGNATION</div>
                <div style="width: 70px; text-align: right;">MONTANT</div>
            </div>
            <div style="border-top: 1px solid #000; margin-bottom: 8px;"></div>
            <div style="margin-bottom: 10px;">${articlesHTML}</div>
            <div style="border-top: 1px dashed #000; margin: 10px 0;"></div>
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 18px; font-weight: bold; margin: 10px 0;">
                <span>TOTAL A PAYER</span>
                <span>${parseFloat(cmd.total || 0).toFixed(2)} DT</span>
            </div>
            <div style="border-top: 1px dashed #000; margin: 10px 0;"></div>
            <div style="text-align: center; font-size: 12px; margin-top: 15px;">
                <p style="margin: 0;">*** BONNE DÉGUSTATION ***</p>
            </div>
            <div style="height: 40px;"></div> 
        </div>
    `;

    setTimeout(() => {
        window.print();
        setTimeout(() => {
            zonePrint.style.display = 'none';
            zonePrint.innerHTML = '';
        }, 500);
    }, 150); 
};

// ========== LOGIQUE DU MODE SOMBRE ==========
window.toggleDarkMode = function() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('tabia_dark_mode', isDark);
    const icon = document.getElementById('iconDarkMode');
    if(icon) icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
};

document.addEventListener("DOMContentLoaded", () => {
    if (localStorage.getItem('tabia_dark_mode') === 'true') {
        document.body.classList.add('dark-mode');
        const icon = document.getElementById('iconDarkMode');
        if(icon) icon.className = 'fas fa-sun';
    }
});
// ========== NOUVEAU : HISTORIQUE DES COMMANDES SERVIES (OPTIMISÉ DARK MODE & UX) ==========
window.afficherModalArchives = function() {
    // 1. Filtrer et trier
    const servies = commandesComptoirCache.filter(c => c.statut === 'livree');
    servies.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    // 2. Mettre à jour le vrai titre de la modale existante
    document.getElementById('modalTitle').innerHTML = '<i class="fas fa-history"></i> Plats Servis (Non payés)';

    let html = '';
    if (servies.length === 0) {
        html = '<div class="empty-message" style="text-align:center; padding:2rem; color:var(--text-muted); font-size:1.1rem;"><i class="fas fa-check-double fa-2x" style="display:block; margin-bottom:10px; opacity:0.5;"></i>Aucun plat en attente de paiement.</div>';
    } else {
        html = servies.map(cmd => {
            const nomAffiche = cmd.clientName ? `Fidèle: ${escapeHtml(cmd.clientName)}` : (cmd.numeroTable === 'Emporter' ? 'À Emporter' : `Table ${cmd.numeroTable}`);
            const timeStr = cmd.date ? cmd.date.split(' ')[1] : new Date(cmd.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            
            // On génère la liste des articles pour que le cuisinier sache ce qu'il a servi
            const articlesHtml = cmd.articles.map(a => `
                <div style="font-size: 0.95rem; font-weight: 600; margin-top: 6px; display: flex; align-items: center; gap: 8px;">
                    <span style="background: var(--col-preparation); color: white; padding: 2px 8px; border-radius: 6px; font-size: 0.85rem;">${parseInt(a.quantite || 1)}x</span> 
                    <span style="color: var(--text-main);">${escapeHtml(a.nom)}</span>
                    ${a.variante ? `<span style="color: var(--text-muted); font-size: 0.85rem; font-style: italic;">(${escapeHtml(a.variante)})</span>` : ''}
                </div>
            `).join('');

            // On utilise var(--bg-body) et var(--text-main) pour que le Dark Mode s'applique automatiquement !
            return `
                <div style="background: var(--bg-body); border: 1px solid rgba(100, 116, 139, 0.3); padding: 15px; border-radius: 12px; margin-bottom: 15px; box-shadow: 0 2px 5px rgba(0,0,0,0.05); transition: all 0.2s;">
                    
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                        <div>
                            <strong style="color:var(--text-main); font-size:1.2rem;">#${cmd.numero} - ${nomAffiche}</strong>
                            <div style="font-size:0.85rem; color:var(--text-muted); margin-top:4px;">
                                <i class="far fa-clock"></i> Servi à ${timeStr}
                            </div>
                        </div>
                        <span class="badge" style="background: rgba(16, 185, 129, 0.1); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); padding:6px 12px; font-size:0.9rem;">
                            <i class="fas fa-check-circle"></i> Servi
                        </span>
                    </div>

                    <div style="border-top: 1px dashed rgba(100, 116, 139, 0.3); padding-top: 10px; margin-bottom: 12px;">
                        ${articlesHtml}
                    </div>

                    <div style="text-align: right;">
                        <button class="btn-action" style="background: #ef4444; color: white; padding: 8px 16px; border-radius: 8px; font-size: 0.9rem; border: none; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; box-shadow: 0 2px 4px rgba(239, 68, 68, 0.3);" onclick="annulerLivree('${cmd.id}')" title="Annuler et remettre sur le comptoir">
                            <i class="fas fa-undo"></i> Remettre en Cuisine
                        </button>
                    </div>

                </div>
            `;
        }).join('');
    }

    document.getElementById('modalBody').innerHTML = `
        <div style="max-height: 65vh; overflow-y: auto; padding-right: 5px; margin-top: 10px;" id="archivesScroller">
            ${html}
        </div>
    `;
    document.getElementById('modalDetails').style.display = 'flex';
};

// Fonction pour remettre une commande servie par erreur en "Terminée" (sur le comptoir)
window.annulerLivree = async function(id) {
    try {
        const response = await fetchSecurise(`/api/commandes/${id}/statut`, {
            method: 'PUT', body: JSON.stringify({ statut: 'terminee' })
        });
        if (response.ok) {
            jouerSonAction();
            afficherNotification("🔙 Commande remise sur le comptoir !", "warning");
        }
    } catch (error) { afficherNotification("❌ Erreur réseau", "error"); }
};