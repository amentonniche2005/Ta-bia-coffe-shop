// ========== SÉCURITÉ : VÉRIFICATION DU TOKEN ==========
const monToken = localStorage.getItem('tabia_caisse_token');

if (!monToken) {
    // Si pas de token, on redirige vers la page de connexion
    window.location.href = '/caisse-login.html'; 
}

// Fonction pour parler au serveur avec le badge de sécurité
async function fetchSecurise(url, options = {}) {
    if (!options.headers) options.headers = {};
    options.headers['authorization'] = monToken; // On montre le badge
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

// ========== CHARGEMENT INITIAL ==========
async function chargerCommandes() {
    try {
        // 🔥 CORRECTION : fetchSecurise au lieu de fetch
        const response = await fetchSecurise('/api/commandes');
        const commandes = await response.json();
        // On ne garde que ce qui n'est pas encore encaissé à la caisse
        commandesComptoirCache = commandes.filter(c => c.statut !== 'paye');
        afficherCommandes();
    } catch (error) {
        afficherNotification("❌ Erreur de chargement des commandes", "error");
    }
}

// ========== ACTIONS ==========
async function demarrerPreparation(id) {
    try {
        // 🔥 CORRECTION : fetchSecurise au lieu de fetch
        const response = await fetchSecurise(`/api/commandes/${id}/statut`, {
            method: 'PUT',
            body: JSON.stringify({ statut: 'en_preparation' })
        });
        if (response.ok) jouerSonAction();
    } catch (error) {
        afficherNotification("❌ Erreur réseau", "error");
    }
}

async function terminerCommande(id) {
    try {
        // 🔥 CORRECTION : fetchSecurise au lieu de fetch
        const response = await fetchSecurise(`/api/commandes/${id}/statut`, {
            method: 'PUT',
            body: JSON.stringify({ statut: 'terminee' })
        });
        if (response.ok) jouerSonAction();
    } catch (error) {
        afficherNotification("❌ Erreur réseau", "error");
    }
}

// ========== SOCKET.IO ==========
let socket = null;

function initSocket() {
    socket = io({ transports: ['websocket', 'polling'], reconnection: true });
    
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
        afficherNotification(`📢 Nouvelle commande #${commande.numero}`, "info");
        
        // Effet visuel
        setTimeout(() => {
            const el = document.querySelector(`.ticket[data-id="${commande.id}"]`);
            if(el) el.style.animation = 'flash 1s ease';
        }, 50);
    });
    
    socket.on('mise_a_jour_commande', (commande) => {
        const index = commandesComptoirCache.findIndex(c => c.id === commande.id);
        if (commande.statut === 'paye') {
            if (index !== -1) commandesComptoirCache.splice(index, 1);
        } else {
            if (index !== -1) commandesComptoirCache[index] = commande;
            else commandesComptoirCache.push(commande);
        }
        afficherCommandes();
    });
    
    socket.on('suppression_commande', (id) => {
        commandesComptoirCache = commandesComptoirCache.filter(c => c.id !== id);
        afficherCommandes();
    });
}

// ========== AFFICHAGE (Rendu HTML) ==========
function afficherCommandes() {
    const enAttente = commandesComptoirCache.filter(c => c.statut === 'en_attente');
    const enPreparation = commandesComptoirCache.filter(c => c.statut === 'en_preparation');
    const terminees = commandesComptoirCache.filter(c => c.statut === 'terminee');
    
    // Tri chronologique
    enAttente.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    enPreparation.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    terminees.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    
    afficherColonne("commandesAttente", enAttente, "attente");
    afficherColonne("commandesPreparation", enPreparation, "preparation");
    afficherColonne("commandesTerminees", terminees, "terminee");
    
    document.getElementById("nbAttente").textContent = enAttente.length;
    document.getElementById("nbPreparation").textContent = enPreparation.length;
}

function afficherColonne(containerId, commandes, type) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    let commandesFiltrees = commandes;
    if (filtreActuel !== "all") {
        commandesFiltrees = commandes.filter(cmd => {
            if (filtreActuel === "client") return cmd.clientId;
            if (filtreActuel === "comptoir") return !cmd.clientId;
            return true;
        });
    }
    
    if (commandesFiltrees.length === 0) {
        container.innerHTML = `
            <div class='empty-col'>
                <i class="fas fa-clipboard-check"></i>
                <p>Aucune commande</p>
            </div>`;
        return;
    }
    
    container.innerHTML = commandesFiltrees.map(cmd => {
        const timeStr = cmd.date ? cmd.date.split(' ')[1] : new Date(cmd.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        const typeOrigine = cmd.clientId ? `<span class="badge badge-client"><i class="fas fa-mobile-alt"></i> Web</span>` : `<span class="badge badge-table"><i class="fas fa-store"></i> Sur Place</span>`;
        const tableBadge = cmd.numeroTable ? `<span class="badge badge-table"><i class="fas fa-chair"></i> Table ${cmd.numeroTable}</span>` : "";

        const itemsHtml = cmd.articles.map(a => `
            <li class="item-row">
                <div class="item-qty">${a.quantite || 1}</div>
                <div class="item-name">${a.nom}</div>
            </li>
        `).join('');

        return `
            <div class="ticket" data-id="${cmd.id}" onclick="voirDetails(${cmd.id})">
                <div class="ticket-header">
                    <span class="ticket-id">#${cmd.numero}</span>
                    <span class="ticket-time"><i class="far fa-clock"></i> ${timeStr}</span>
                </div>
                <div class="badges-row">
                    ${tableBadge}
                    ${typeOrigine}
                </div>
                <ul class="items-list">
                    ${itemsHtml}
                </ul>
                <div class="ticket-actions">
                    ${getBoutonsAction(cmd, type)}
                </div>
            </div>
        `;
    }).join('');
}

function getBoutonsAction(cmd, type) {
    if (type === "attente") {
        return `<button class="btn-action btn-start" onclick="event.stopPropagation(); demarrerPreparation(${cmd.id})"><i class="fas fa-fire"></i> Préparer</button>`;
    } else if (type === "preparation") {
        return `<button class="btn-action btn-finish" onclick="event.stopPropagation(); terminerCommande(${cmd.id})"><i class="fas fa-check-double"></i> Terminer</button>`;
    }
    return "";
}

// ========== MODAL DÉTAILS ==========
function voirDetails(id) {
    const cmd = commandesComptoirCache.find(c => c.id === id);
    if (!cmd) return;
    
    document.getElementById("modalTitle").textContent = `Commande #${cmd.numero}`;
    
    let html = `
        <div style="margin-bottom: 1.5rem; background: #f8fafc; padding: 1rem; border-radius: 12px; border: 1px solid #e2e8f0;">
            ${cmd.numeroTable ? `<div style="margin-bottom:0.5rem;"><strong><i class="fas fa-chair"></i> Table :</strong> ${cmd.numeroTable}</div>` : ''}
            <div style="margin-bottom:0.5rem;"><strong><i class="fas fa-compass"></i> Origine :</strong> ${cmd.clientId ? 'Client Web (Mobile)' : 'Caisse / Serveur'}</div>
            <div><strong><i class="far fa-clock"></i> Heure :</strong> ${cmd.date || new Date(cmd.timestamp).toLocaleString()}</div>
        </div>
        <h3 style="font-size: 1.1rem; margin-bottom: 1rem; border-bottom: 2px solid #e2e8f0; padding-bottom: 0.5rem;">Articles à préparer</h3>
        <div style="border-radius: 10px;">
            ${cmd.articles.map(a => `
                <div style="display:flex; justify-content:space-between; align-items: center; margin-bottom:0.8rem; font-weight:700; font-size: 1.1rem;">
                    <div style="display: flex; gap: 10px; align-items: center;">
                        <span style="background: #e2e8f0; padding: 4px 10px; border-radius: 6px;">${a.quantite}x</span>
                        <span>${a.nom}</span>
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

// ========== ANIMATION CSS DYNAMIQUE ==========
const style = document.createElement('style');
style.textContent = `
    @keyframes flash { 0% { background: #fef08a; transform: scale(1.02); } 100% { background: white; transform: scale(1); } }
    @keyframes slideInRight { from { transform: translateX(120%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
`;
document.head.appendChild(style);

// ========== INIT ==========
document.addEventListener("DOMContentLoaded", () => {
    initSocket();
    chargerCommandes();
});

window.demarrerPreparation = demarrerPreparation;
window.terminerCommande = terminerCommande;
window.voirDetails = voirDetails;
window.fermerModal = fermerModal;
window.rafraichirCommandes = rafraichirCommandes;
window.changerFiltre = changerFiltre;