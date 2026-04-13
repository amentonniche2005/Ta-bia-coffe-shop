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

async function chargerCommandes() {
    try {
        const response = await fetchSecurise('/api/commandes');
        const commandes = await response.json();
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
    
    // Filtres actuels
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
        const nomAffiche = cmd.clientName ? `<i class="fas fa-star"></i> ${cmd.clientName}` : `#${cmd.numero}`;
        const colorTitre = cmd.clientName ? 'color:#ea580c; font-size:1.2rem;' : ''; 
        const textTable = (cmd.numeroTable === 'Emporter' || !cmd.numeroTable) ? 'À Emporter' : `Table ${cmd.numeroTable}`;
        
        const badgeTable = cmd.clientName 
            ? `<span class="badge" style="background:#fef5e6; color:#e67e22; border:1px solid #fed7aa;"><i class="fas fa-star"></i> Fidèle - ${textTable}</span>` 
            : `<span class="badge badge-table"><i class="fas fa-chair"></i> ${textTable}</span>`;
        
        const badgeOrigine = cmd.clientId && !cmd.clientName 
            ? `<span class="badge badge-client"><i class="fas fa-mobile-alt"></i> Web</span>` : ``;

        const badgePaiement = cmd.methodePaiement === 'en_ligne'
            ? `<span class="badge" style="background:#dcfce7; color:#166534; border:1px solid #bbf7d0;"><i class="fas fa-check-circle"></i> Payé</span>`
            : `<span class="badge" style="background:#fee2e2; color:#b91c1c; border:1px solid #fecaca;"><i class="fas fa-hand-holding-usd"></i> À encaisser</span>`;

// 🔥 NOUVEAUTÉ : GÉNÉRATION DU BADGE CHRONOMÈTRE (SLA) AVEC DATA-TIMESTAMP
        let slaHtml = '';
        if (cmd.statut !== 'terminee') {
            const sla = getSLAInfo(cmd.timestamp);
            // On ajoute l'ID de la commande et le timestamp pour le chronomètre en direct
            slaHtml = `<div id="sla-${cmd.id}" class="sla-badge ${sla.class}" data-timestamp="${cmd.timestamp}">
                         <i class="fas ${sla.icon}"></i> <span>${sla.text}</span>
                       </div>`;
        }

        const itemsHtml = cmd.articles.map(a => `
            <li class="item-row">
                <div class="item-qty">${a.quantite || 1}</div>
                <div class="item-name">${a.nom} ${a.variante ? `<span style="display:block; font-size:0.8rem; color:#64748b; font-weight:normal;">(${a.variante})</span>` : ''}</div>
            </li>
        `).join('');

        return `
            <div class="ticket" data-id="${cmd.id}" onclick="voirDetails(${cmd.id})">
                <div class="ticket-header">
                    <span class="ticket-id" style="${colorTitre}">${nomAffiche}</span>
                    <div class="ticket-time-container">
                        <span class="ticket-time"><i class="far fa-clock"></i> ${timeStr}</span>
                        ${slaHtml} </div>
                </div>
                <div class="badges-row">
                    ${badgeTable} ${badgeOrigine} ${badgePaiement} 
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
    
    document.getElementById("modalTitle").textContent = cmd.clientName ? `Détails de ${cmd.clientName}` : `Commande #${cmd.numero}`;
    
    const textTable = (cmd.numeroTable === 'Emporter' || !cmd.numeroTable) ? 'À Emporter' : `Table ${cmd.numeroTable}`;

    let html = `
        <div style="margin-bottom: 1.5rem; background: #f8fafc; padding: 1rem; border-radius: 12px; border: 1px solid #e2e8f0;">
            <div style="margin-bottom:0.5rem; font-size: 1.1rem;">
                <strong><i class="fas fa-map-marker-alt"></i> Destination :</strong> 
                ${cmd.clientName ? `<span style="color:#e67e22; font-weight:bold;">🌟 Fidèle (${cmd.clientName}) - ${textTable}</span>` : textTable}
            </div>
<div style="margin-bottom:0.5rem;"><strong><i class="fas fa-compass"></i> Origine :</strong> ${cmd.clientId ? 'Client Web (Mobile)' : 'Caisse / Serveur'}</div>
            
            <div style="margin-bottom:0.5rem;">
                <strong><i class="fas fa-wallet"></i> Paiement :</strong> 
                ${cmd.methodePaiement === 'en_ligne' 
                    ? '<span style="color:#166534; font-weight:bold; background:#dcfce7; padding:2px 8px; border-radius:10px;">✅ Déjà payé en ligne</span>' 
                    : '<span style="color:#b91c1c; font-weight:bold; background:#fee2e2; padding:2px 8px; border-radius:10px;">⚠️ À encaisser à la caisse</span>'}
            </div>

            <div><strong><i class="far fa-clock"></i> Heure :</strong> ${cmd.date || new Date(cmd.timestamp).toLocaleString()}</div>
        </div>
        <h3 style="font-size: 1.1rem; margin-bottom: 1rem; border-bottom: 2px solid #e2e8f0; padding-bottom: 0.5rem;">Articles à préparer</h3>
        <div style="border-radius: 10px;">
            ${cmd.articles.map(a => `
                <div style="display:flex; justify-content:space-between; align-items: center; margin-bottom:0.8rem; font-weight:700; font-size: 1.1rem;">
                    <div style="display: flex; gap: 10px; align-items: center;">
                        <span style="background: #e2e8f0; padding: 4px 10px; border-radius: 6px;">${a.quantite}x</span>
                        <span>${a.nom} ${a.variante ? `<i style="color:#64748b; font-size:0.9rem;">(${a.variante})</i>` : ''}</span>
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
// ========== CALCUL DU TEMPS D'ATTENTE (SLA) ==========
// ========== CALCUL DU TEMPS D'ATTENTE (SLA) ==========
function getSLAInfo(timestamp) {
    const now = Date.now();
    const diffMs = now - (timestamp || now);
    const diffMins = Math.floor(diffMs / 60000); // Convertir en minutes

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
        // On sélectionne tous les badges SLA actuellement affichés à l'écran
        const slaBadges = document.querySelectorAll('.sla-badge');
        
        slaBadges.forEach(badge => {
            const timestamp = parseInt(badge.getAttribute('data-timestamp'));
            if (!timestamp) return;

            const sla = getSLAInfo(timestamp);
            
            // 1. On met à jour le texte du temps (Ex: "4 min")
            const textSpan = badge.querySelector('span');
            if (textSpan && textSpan.innerText !== sla.text) {
                textSpan.innerText = sla.text;
            }

            // 2. On met à jour l'icône si elle a changé
            const icon = badge.querySelector('i');
            if (icon && !icon.classList.contains(sla.icon)) {
                icon.className = `fas ${sla.icon}`;
            }

            // 3. On met à jour la couleur (Classe CSS) si le palier (5 ou 10 min) est franchi
            if (!badge.classList.contains(sla.class)) {
                badge.classList.remove('sla-good', 'sla-warning', 'sla-danger');
                badge.classList.add(sla.class);
            }
        });
    }, 1000); // Tourne toutes les secondes (1000 ms)
}

// ========== ANIMATION CSS DYNAMIQUE ==========
const style = document.createElement('style');
style.textContent = `
    @keyframes flash { 0% { background: #fef08a; transform: scale(1.02); } 100% { background: white; transform: scale(1); } }
    @keyframes slideInRight { from { transform: translateX(120%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
`;
document.head.appendChild(style);
// 🔥 INSCRIPTION DU SERVICE WORKER (Pour l'installation de l'application)
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
    
    // 🔥 Lancement du chronomètre invisible
    demarrerChronoFluid();
});

window.demarrerPreparation = demarrerPreparation;
window.terminerCommande = terminerCommande;
window.voirDetails = voirDetails;
window.fermerModal = fermerModal;
window.rafraichirCommandes = rafraichirCommandes;
window.changerFiltre = changerFiltre;