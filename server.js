require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 3000;
const SUPER_ADMIN_TOKEN = process.env.SUPER_ADMIN_TOKEN || 'SARBINI_BOSS_2026';
// 🔥 MOTEUR DE CONVERSION DES UNITÉS ERP
const CONVERSIONS = {
    'mg': 0.001, 'g': 1, 'kg': 1000,
    'ml': 1, 'cl': 10, 'L': 1000,
    'cac': 5, 'cas': 15,
    'u': 1, 'portion': 1
};

function calculerQuantiteDestockage(qteRecette, uniteRecette, uniteStock) {
    const facteurRecette = CONVERSIONS[uniteRecette] || 1;
    const facteurStock = CONVERSIONS[uniteStock] || 1;
    return (qteRecette * facteurRecette) / facteurStock;
}
// 🛡️ B. LE GARDE-BARRIÈRE (Bloque les faux sites ET les abonnements impayés)
const verifierExistenceCafe = async (req, res, next) => {
    const host = req.headers.host || ''; 
    const subdomain = host.split('.')[0];

    // On inclut localhost pour que tu puisses faire tes tests sur ton ordinateur !
    if (host === 'sarbini.click' || subdomain === 'www' || host.includes('localhost')) {
        req.cafeId = 'sarbini';
        return next();
    }

    try {
        const cafeExistant = await mongoose.model('StoreSettings').findOne({ cafeId: subdomain, type: 'branding' });
        
        // ⚠️ 1. SOUS-DOMAINE INTROUVABLE : Page de Vente SARBINI.CLICK
        if (!cafeExistant) {
            return res.status(404).send(`
                <!DOCTYPE html>
                <html lang="fr">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Créez votre Menu | SARBINI.CLICK</title>
                    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
                    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;700;900&display=swap" rel="stylesheet">
                    <style>
                        body { background: #0b1121; color: #fff; font-family: 'Outfit', sans-serif; margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; text-align: center; }
                        .promo-card { background: #161f33; border: 1px solid rgba(0, 242, 254, 0.2); padding: 40px 30px; border-radius: 30px; max-width: 500px; width: 90%; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6), inset 0 0 20px rgba(0, 242, 254, 0.05); position: relative; overflow: hidden; }
                        .promo-card::before { content: ''; position: absolute; top: -50px; right: -50px; width: 150px; height: 150px; background: rgba(0, 242, 254, 0.15); border-radius: 50%; filter: blur(40px); }
                        .logo-container { width: 75px; height: 75px; background: #0b1121; border: 2px solid rgba(0, 242, 254, 0.5); border-radius: 50%; display: flex; justify-content: center; align-items: center; margin: 0 auto 20px; box-shadow: 0 0 20px rgba(0, 242, 254, 0.3); }
                        .logo-icon { font-size: 30px; color: #00F2FE; filter: drop-shadow(0 0 8px #00F2FE); }
                        h1 { font-size: 28px; font-weight: 900; letter-spacing: 3px; margin: 0 0 15px 0; }
                        .neon-text { color: #00F2FE; text-shadow: 0 0 10px rgba(0, 242, 254, 0.4); }
                        p { color: #94a3b8; font-size: 15px; line-height: 1.6; margin-bottom: 30px; font-weight: 300; }
                        
                        .pricing { display: flex; gap: 10px; margin-bottom: 30px; }
                        .plan { flex: 1; background: rgba(0, 242, 254, 0.05); padding: 15px 5px; border-radius: 16px; border: 1px solid rgba(0, 242, 254, 0.2); transition: 0.3s; }
                        .plan:hover { transform: translateY(-5px); border-color: #00F2FE; box-shadow: 0 10px 20px rgba(0, 242, 254, 0.15); }
                        .plan span { display: block; font-size: 11px; color: #94a3b8; text-transform: uppercase; font-weight: 700; letter-spacing: 1px; }
                        .plan strong { display: block; font-size: 22px; color: #fff; margin-top: 5px; font-weight: 900; }
                        
                        .btn-whatsapp { display: inline-flex; align-items: center; justify-content: center; gap: 10px; background: #00F2FE; color: #000; padding: 18px 30px; border-radius: 16px; text-decoration: none; font-weight: 900; font-size: 16px; transition: 0.3s; box-shadow: 0 0 20px rgba(0, 242, 254, 0.4); width: 100%; box-sizing: border-box; }
                        .btn-whatsapp:hover { transform: scale(1.03); box-shadow: 0 0 30px rgba(0, 242, 254, 0.6); }
                        .footer-text { margin-top: 25px; font-size: 11px; color: #475569; letter-spacing: 3px; font-weight: 700; }
                    </style>
                </head>
                <body>
                    <div class="promo-card">
                        <div class="logo-container"><i class="fas fa-bolt logo-icon"></i></div>
                        <h1>SARBINI<span class="neon-text">.CLICK</span></h1>
                        <p>Le futur de votre établissement commence ici. Point de vente ultra-rapide (POS), Écran Cuisine, Menu QR, Fidélité VIP, Caisse,Gestion de stock et Comptabilite. Prenez le contrôle total de votre activité.</p>
                        
                        <div class="pricing">
                            <div class="plan"><span>1 Mois</span><strong>109 DT</strong></div>
                            <div class="plan" style="border-color: #00F2FE; background: rgba(0, 242, 254, 0.1);"><span>3 Mois</span><strong>299 DT</strong></div>
                            <div class="plan"><span>1 An</span><strong>1199 DT</strong></div>
                        </div>

                        <a href="https://wa.me/21654567939?text=Je%20veux%20lancer%20mon%20système%20Sarbini" class="btn-whatsapp">
                            <i class="fab fa-whatsapp text-xl"></i> CONTACTER POUR DÉPLOYER
                        </a>

                        <div class="footer-text">SYSTEM ENGINE ONLINE</div>
                    </div>
                </body>
                </html>
            `);
        }

        // ⚠️ 2. ABONNEMENT SUSPENDU : Page d'avertissement Sarbini
        if (cafeExistant.statutAbonnement === 'suspendu') {
            return res.status(403).send(`
                <!DOCTYPE html>
                <html lang="fr">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Service Suspendu | SARBINI.CLICK</title>
                    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
                    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;700;900&display=swap" rel="stylesheet">
                    <style>
                        body { background: #0b1121; color: #fff; font-family: 'Outfit', sans-serif; margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; text-align: center; }
                        .suspend-card { background: #161f33; border: 1px solid rgba(244, 63, 94, 0.3); padding: 40px 30px; border-radius: 30px; max-width: 450px; width: 90%; box-shadow: 0 20px 50px rgba(0,0,0,0.6), inset 0 0 20px rgba(244, 63, 94, 0.05); position: relative; overflow: hidden; }
                        .suspend-card::before { content: ''; position: absolute; top: -50px; left: -50px; width: 150px; height: 150px; background: rgba(244, 63, 94, 0.15); border-radius: 50%; filter: blur(40px); }
                        .icon-container { width: 80px; height: 80px; background: rgba(244, 63, 94, 0.1); border: 2px solid rgba(244, 63, 94, 0.5); border-radius: 50%; display: flex; justify-content: center; align-items: center; margin: 0 auto 20px; box-shadow: 0 0 20px rgba(244, 63, 94, 0.2); }
                        .icon-container i { font-size: 35px; color: #f43f5e; }
                        h1 { font-size: 26px; font-weight: 900; margin: 0 0 15px 0; color: #fff; letter-spacing: 1px; }
                        p { color: #94a3b8; font-size: 15px; line-height: 1.6; margin-bottom: 30px; font-weight: 300; }
                        .footer-text { margin-top: 30px; font-size: 11px; color: #475569; letter-spacing: 3px; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 6px;}
                        .neon-dot { color: #00F2FE; }
                    </style>
                </head>
                <body>
                    <div class="suspend-card">
                        <div class="icon-container"><i class="fas fa-lock"></i></div>
                        <h1>Système Suspendu</h1>
                        <p>L'abonnement de cet établissement a expiré ou a été mis en pause.<br><br>Veuillez contacter l'administration de <b>SARBINI.CLICK</b> pour réactiver vos services instantanément.</p>
                        
                        <div class="footer-text">
                            <i class="fas fa-bolt neon-dot"></i> POWERED BY SARBINI<span class="neon-dot">.CLICK</span>
                        </div>
                    </div>
                </body>
                </html>
            `);
        }

        req.cafeId = subdomain;
        next();
    } catch (err) { 
        res.status(500).send("Erreur de validation système."); 
    }
};

// 🔐 2. SÉCURITÉ WEBSOCKET (Indépendante)
io.use(async (socket, next) => {
    const host = socket.handshake.headers.host || '';
    const subdomain = host.split('.')[0];
    socket.cafeId = subdomain;

    if (socket.handshake.query.clientType === 'customer') return next();

    const token = socket.handshake.auth.token || socket.handshake.headers['authorization'];
    try {
        const config = await mongoose.model('StoreSettings').findOne({ cafeId: subdomain, type: 'branding' });
        const vraiMdp = (config && config.caisseToken) ? config.caisseToken : '12345678';
        if (token === vraiMdp) next();
        else next(new Error("Accès refusé."));
    } catch(err) { next(new Error("Erreur serveur.")); }
});

// 🚀 3. ACTIVATION DES MIDDLEWARES (Dans le bon ordre)
app.use(cors());
app.use(express.json());
app.use(verifierExistenceCafe); // 🔥 Doit être ici pour protéger les pages web
app.use(express.static(path.join(__dirname, 'public'), { index: false }));
io.on('connection', (socket) => {
    if (socket.cafeId) socket.join(socket.cafeId);
});

// ========== 1. CONNEXION MONGODB ATLAS ==========
const mongoURI = process.env.MONGODB_URI;

mongoose.connect(mongoURI)
    .then(() => console.log("🚀 TA'BIA DB : Connectée avec succès !"))
    .catch(err => { 
        console.error("❌ Erreur critique de connexion DB:", err); 
        process.exit(1); 
    });

// ========== 2. MODÈLES DE DONNÉES (SCHÉMAS SAAS MULTI-TENANT) ==========
// 🔥 SAAS : Ajout de "cafeId" obligatoire sur TOUTES les tables

const Product = mongoose.model('Product', new mongoose.Schema({
    cafeId: { type: String, required: true, index: true }, // 🔥 LE MARQUEUR
    id: Number, 
    nom: String, 
    prix: { type: Number, default: 0 },
    prixPromo: { type: Number, default: 0 }, 
    prixAchat: { type: Number, default: 0 }, 
    stock: Number, 
    categorie: String, 
    image: { type: String, default: 'https://via.placeholder.com/150' },
    variantes: { type: String, default: "" }, 
    typeChoix: { type: String, default: "unique" },
    seuilAlerte: { type: Number, default: 10 }, 
    unite: String,
    actif: { type: Boolean, default: true },
supplements: [{
        nom: String,                // Nom affiché au client (ex: "Double Fromage")
        prix: Number,               // Prix facturé (ex: 2.500)
        prixPromo: { type: Number, default: 0 }, 
        ingredientId: String,       // L'ID de la matière première à déduire (ex: ID de la Mozzarella)
        quantiteADeduire: Number,   // Combien on enlève du stock (ex: 50)
        unite: String               // Unité de la déduction (ex: 'g')
    }],
    isManufactured: { type: Boolean, default: false }, // true si c'est un produit avec recette
    recipe: [{
        ingredientId: { type: String }, // ID du produit utilisé comme ingrédient
        quantity: { type: Number },     // Quantité nécessaire pour 1 unité du produit fini
        unit: { type: String }          // g, ml, unité, etc.
    }]
}));

const Movement = mongoose.model('Movement', new mongoose.Schema({
    cafeId: { type: String, required: true, index: true },
    date: { type: String, default: () => new Date().toLocaleString('fr-FR') },
    type: String, produit: String, produitId: Number, quantite: Number,
    ancienStock: Number, nouveauStock: Number, raison: String
}));

const Inventory = mongoose.model('Inventory', new mongoose.Schema({
    cafeId: { type: String, required: true, index: true },
    date: { type: String, default: () => new Date().toLocaleString('fr-FR') }, ecarts: Array
}));

const Expense = mongoose.model('Expense', new mongoose.Schema({
    cafeId: { type: String, required: true, index: true },
    date: { type: String, default: () => new Date().toLocaleString('fr-FR') },
    timestamp: { type: Number, default: () => Date.now() },
    categoriePrincipale: String, sousCategorie: String,       
    beneficiaire: String, description: String, montantTotal: Number,        
    montantPaye: Number, resteAPayer: { type: Number, default: 0 }, 
    statut: { type: String, default: 'paye' }, modePaiement: String
}));

const Order = mongoose.model('Order', new mongoose.Schema({
    cafeId: { type: String, required: true, index: true },
    id: String, numero: String, date: String, timestamp: Number, 
    // 🔥 CORRECTION ICI : On définit précisément la structure d'un article
    articles: [{
        id: String,
        nom: String,
        variante: String,
        quantite: Number,
        prix: Number,
        isSupplement: Boolean,    // Pour identifier le supplément
        uniqueGroupId: Number,    // Identifiant unique de la ligne
        parentId: Number          // Le lien vers le plat principal
    }],
    numeroTable: String, statut: { type: String, default: 'en_attente' }, 
    total: Number, clientId: String, clientName: String,
    methodePaiement: { type: String, default: 'sur_place' }
}));

const TableCode = mongoose.model('TableCode', new mongoose.Schema({
    cafeId: { type: String, required: true, index: true },
    numero: Number, code: String, lastUpdated: Number
}));

const LoyalCustomer = mongoose.model('LoyalCustomer', new mongoose.Schema({
    cafeId: { type: String, required: true, index: true },
    nom: String, prenom: String, telephone: String,
    codeFidelite: { type: String }, // Ne plus mettre unique:true globalement à cause du multi-café
    dateInscription: { type: String, default: () => new Date().toLocaleDateString('fr-FR') },
    solde: { type: Number, default: 0 }, points: { type: Number, default: 0 }, 
    totalDepense: { type: Number, default: 0 } 
}));

const StoreSettings = mongoose.model('StoreSettings', new mongoose.Schema({
    cafeId: { type: String, required: true, index: true },
    type: { type: String }, 
    pointsRequis: { type: Number, default: 100 }, 
    valeurCredit: { type: Number, default: 5 },
    nomCafe: String,
    sloganCafe: String,
    couleurPrincipale: String,
    logoUrl: String,
    caisseToken: String,
    codeServeur: { type: String, default: '00000' },
    nombreTables: { type: Number, default: 20 },
    statutAbonnement: { type: String, default: 'actif' },
    dateExpiration: String
}));

const Sale = mongoose.model('Sale', new mongoose.Schema({
    cafeId: { type: String, required: true, index: true },
    id: String, numero: String,
    date: { type: String, default: () => new Date().toLocaleString('fr-FR') },
    timestamp: { type: Number, default: () => Date.now() },
    total: Number, remise: Number,
    typePaiement: String, methodePaiement: { type: String, default: 'especes' },
    tableOrigine: String, 
    // 🔥 CORRECTION ICI AUSSI POUR LA CAISSE / LES ARCHIVES
    articles: [{
        id: String,
        nom: String,
        variante: String,
        quantite: Number,
        prix: Number,
        isSupplement: Boolean,
        uniqueGroupId: Number,
        parentId: Number
    }]
}));

const CashRegister = mongoose.model('CashRegister', new mongoose.Schema({
    cafeId: { type: String, required: true, index: true },
    dateOuverture: { type: String, default: () => new Date().toLocaleString('fr-FR') },
    dateFermeture: String, timestampOuverture: { type: Number, default: () => Date.now() },
    fondDeCaisse: Number, totalVentesEspeces: { type: Number, default: 0 },
    especesReelles: Number, ecart: Number, statut: { type: String, default: 'ouvert' } 
}));

const OpenTicket = mongoose.model('OpenTicket', new mongoose.Schema({
    cafeId: { type: String, required: true, index: true },
    tableNum: String, ticketData: Object,
    lastUpdated: { type: Number, default: () => Date.now() }
}));

// ========== 3. MIDDLEWARES ET SÉCURITÉ ==========
app.use(cors());
app.use(express.json());
app.use(verifierExistenceCafe);
// 🔥 Le portier qui vérifie chaque action du caissier
async function verifierToken(req, res, next) {
    const tokenFourni = req.headers['authorization'];
    try {
        const config = await StoreSettings.findOne({ cafeId: req.cafeId, type: 'branding' });
        const vraiMotDePasse = (config && config.caisseToken) ? config.caisseToken : '12345678';

        if (tokenFourni === vraiMotDePasse) {
            next();
        } else {
            res.status(403).json({ error: "Accès refusé. Mot de passe caisse incorrect pour ce café." });
        }
    } catch(e) { res.status(500).json({ error: "Erreur de vérification" }); }
}

function verifierSuperAdmin(req, res, next) {
    const tokenFourni = req.headers['authorization'];
    if (tokenFourni === SUPER_ADMIN_TOKEN) { next(); } 
    else { res.status(403).json({ error: "Accès refusé. Réservé à Sarbini." }); }
}

// 🔥 La route qui valide la connexion sur la page de login
app.post('/api/caisse/verify', async (req, res) => {
    try {
        const config = await StoreSettings.findOne({ cafeId: req.cafeId, type: 'branding' });
        const vraiMotDePasse = (config && config.caisseToken) ? config.caisseToken : '12345678';
        
        if (req.body.token === vraiMotDePasse) { 
            res.json({ success: true, message: "Token accepté" }); 
        } else { 
            res.status(401).json({ success: false, message: "Token invalide pour " + req.cafeId }); 
        }
    } catch(e) { res.status(500).json({ success: false }); }
});
// 🔥 LISTER TOUS LES CAFÉS (Réservé à Sarbini)
app.get('/api/admin/cafes', verifierSuperAdmin, async (req, res) => {
    try {
        const cafes = await StoreSettings.find({ type: 'branding' });
        res.json(cafes);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 🔥 SUPPRIMER UN CAFÉ ET TOUTES SES DONNÉES
app.delete('/api/admin/cafes/:targetId', verifierSuperAdmin, async (req, res) => {
    try {
        const target = req.params.targetId;
        // On nettoie TOUT ce qui appartient à ce café
        await StoreSettings.deleteMany({ cafeId: target });
        await Product.deleteMany({ cafeId: target });
        await Order.deleteMany({ cafeId: target });
        await LoyalCustomer.deleteMany({ cafeId: target });
        res.json({ success: true, message: `Le café ${target} a été supprimé.` });
    } catch (err) { res.status(500).json({ error: err.message }); }
});
// 🔥 SUSPENDRE OU RÉACTIVER UN CAFÉ (VERSION CORRIGÉE)
app.put('/api/admin/cafes/:targetId/statut', verifierSuperAdmin, async (req, res) => {
    try {
        const { statut } = req.body; // 'actif' ou 'suspendu'
        
        // 🔥 CORRECTION : On utilise $set pour forcer l'écriture dans MongoDB
        await StoreSettings.updateOne(
            { cafeId: req.params.targetId, type: 'branding' },
            { $set: { statutAbonnement: statut } }
        );
        
        res.json({ success: true, message: `Le café est maintenant ${statut}.` });
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});
// =========================================================
// ========== 4. ROUTES API PUBLIQUES ==================
// =========================================================
// =========================================================
// 🔥 API BRANDING (DESIGN DU CAFÉ SAAS)
// =========================================================
app.get('/api/branding', async (req, res) => {
    try {
        let config = await StoreSettings.findOne({ cafeId: req.cafeId, type: 'branding' });
        
        // 🔥 NOUVEAU : Si le café n'existe pas en base de données, on bloque !
        if (!config) {
            return res.status(404).json({ introuvable: true, message: "Ce café n'existe pas." });
        }
        
        res.json(config);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/branding', verifierSuperAdmin, async (req, res) => {
    try {
        const { nomCafe, sloganCafe, couleurPrincipale, logoUrl, caisseToken,codeServeur, targetCafeId, nombreTables, dateExpiration, cloneFromId } = req.body;
        
        const cafeCible = targetCafeId ? targetCafeId : req.cafeId;

        const config = await StoreSettings.findOneAndUpdate(
            { cafeId: cafeCible, type: 'branding' },
            { nomCafe, sloganCafe, couleurPrincipale, logoUrl, caisseToken,codeServeur, nombreTables, dateExpiration }, 
            { new: true, upsert: true }
        );

        // 🔥 LOGIQUE DE CLONAGE DU MENU SAAS
        if (cloneFromId) {
            const existingProducts = await Product.countDocuments({ cafeId: cafeCible });
            if (existingProducts === 0) { 
                const produitsACloner = await Product.find({ cafeId: cloneFromId });
                if (produitsACloner.length > 0) {
                    const nouveauxProduits = produitsACloner.map(p => ({
                        cafeId: cafeCible, id: p.id, nom: p.nom, prix: p.prix, prixAchat: p.prixAchat,
                        stock: p.stock, categorie: p.categorie, image: p.image, variantes: p.variantes,
                        typeChoix: p.typeChoix, seuilAlerte: p.seuilAlerte, unite: p.unite, actif: true
                    }));
                    await Product.insertMany(nouveauxProduits);
                }
            }
        }

        res.json({ success: true, config });
    } catch (err) { res.status(500).json({ error: err.message }); }
});


app.get('/api/stock', async (req, res) => {
    try { res.json(await Product.find({ cafeId: req.cafeId, actif: { $ne: false } }).sort({ id: 1 })); } catch (err) { res.status(500).json(err); }
});

app.post('/api/commandes', async (req, res) => {
    try {
        const codeEnvoye = String(req.body.codeAuth);
        
        // VÉRIFICATIONS SÉCURITÉ
        const config = await StoreSettings.findOne({ cafeId: req.cafeId, type: 'branding' });
        const vraiCodeServeur = (config && config.codeServeur) ? config.codeServeur : '00000';
        const vraiCaisseToken = (config && config.caisseToken) ? config.caisseToken : '12345678';
        const tokenFourni = req.headers['authorization'];

        let authValid = false;
        if (tokenFourni && tokenFourni === vraiCaisseToken) authValid = true;
        else if (codeEnvoye === vraiCodeServeur) authValid = true;
        else if (codeEnvoye) {
            const fidele = await LoyalCustomer.findOne({ cafeId: req.cafeId, codeFidelite: codeEnvoye });
            if (fidele) authValid = true;
        }
        if (!authValid && req.body.numeroTable && req.body.numeroTable !== 'Emporter') {
            const tableDb = await TableCode.findOne({ cafeId: req.cafeId, numero: parseInt(req.body.numeroTable) });
            if (tableDb && tableDb.code === codeEnvoye) authValid = true;
        }
        if (!authValid && req.body.methodePaiement === 'en_ligne') authValid = true;

        if (!authValid) return res.status(403).json({ error: "QRCode expiré ou Code Incorrect" });

        const cmdId = Date.now().toString();
        const numeroCmd = 'CMD' + Math.floor(Math.random() * 10000);

        let totalSecurise = 0;
        let articlesSecurises = [];

        for (let art of req.body.articles) {
            let nomPropre = art.nom || "";
            if (nomPropre.startsWith('+ ')) nomPropre = nomPropre.substring(2).trim();
            const nomBaseRecherche = nomPropre.split('(')[0].trim();
            const qteCmd = parseInt(art.quantite) || 1;

            // ==========================================
            // CAS 1 : C'EST UN SUPPLÉMENT
            // ==========================================
            if (art.isSupplement && art.parentId) {
                const parentArticle = req.body.articles.find(a => String(a.uniqueGroupId) === String(art.parentId) || String(a.id) === String(art.parentId));
                let parentDb = null;
                
                if (parentArticle) {
                    const idParent = parentArticle.baseId || parentArticle.id;
                    if (idParent && !isNaN(idParent)) parentDb = await Product.findOne({ cafeId: req.cafeId, id: Number(idParent) });
                    else if (idParent && mongoose.Types.ObjectId.isValid(idParent)) parentDb = await Product.findOne({ cafeId: req.cafeId, _id: idParent });
                    if (!parentDb) parentDb = await Product.findOne({ cafeId: req.cafeId, nom: parentArticle.nom.split('(')[0].trim() });
                }

                if (parentDb && parentDb.supplements) {
                    const configSupp = parentDb.supplements.find(s => s.nom === art.nom || s.nom === nomPropre);
                    let prixApplique = art.prix;
                    
                    if (configSupp) {
                        if (configSupp.prixPromo && configSupp.prixPromo > 0) prixApplique = configSupp.prixPromo;
                        else if (configSupp.prix !== undefined) prixApplique = configSupp.prix;
                    }
                    
                    totalSecurise += (prixApplique * qteCmd);
                    articlesSecurises.push({ ...art, prix: prixApplique });

                    // 🔥 DÉSTOCKAGE DU SUPPLÉMENT AVEC CONVERSION
                    if (configSupp && configSupp.ingredientId) {
                        let queryIng = !isNaN(configSupp.ingredientId) ? { id: Number(configSupp.ingredientId) } : { _id: configSupp.ingredientId };
                        const ingDb = await Product.findOne({ cafeId: req.cafeId, ...queryIng });
                        
                        if (ingDb) {
                            const qteBase = (configSupp.quantiteADeduire || 0) * qteCmd;
                            const qteADeduireTotal = calculerQuantiteDestockage(qteBase, configSupp.unite || 'g', ingDb.unite || 'g');

                            const ing = await Product.findOneAndUpdate(
                                { cafeId: req.cafeId, ...queryIng },
                                { $inc: { stock: -qteADeduireTotal } },
                                { new: true }
                            );
                            if (ing) {
                                await new Movement({
                                    cafeId: req.cafeId, type: 'commande', produit: ing.nom, produitId: ing.id || ing._id,
                                    quantite: qteADeduireTotal, ancienStock: ing.stock + qteADeduireTotal, nouveauStock: ing.stock,
                                    raison: `Supplément : ${nomPropre} pour ${parentDb.nom}`
                                }).save();
                            }
                        }
                    }
                } else {
                    totalSecurise += (art.prix * qteCmd);
                    articlesSecurises.push(art);
                }
            } 
            // ==========================================
            // CAS 2 : C'EST UN PRODUIT NORMAL (Matière ou Recette)
            // ==========================================
            else {
                let produitDb = null;
                const idSrc = art.baseId || art.id;
                
                if (idSrc && !isNaN(idSrc)) produitDb = await Product.findOne({ cafeId: req.cafeId, id: Number(idSrc) });
                else if (idSrc && mongoose.Types.ObjectId.isValid(idSrc)) produitDb = await Product.findOne({ cafeId: req.cafeId, _id: idSrc });
                if (!produitDb) produitDb = await Product.findOne({ cafeId: req.cafeId, nom: nomBaseRecherche });

                if (produitDb) {
                    let prixBaseDb = (produitDb.prixPromo && produitDb.prixPromo > 0) ? produitDb.prixPromo : produitDb.prix;
                    totalSecurise += (prixBaseDb * qteCmd);
                    articlesSecurises.push({ ...art, prix: prixBaseDb, id: produitDb.id || produitDb._id, baseId: produitDb.id || produitDb._id, nom: produitDb.nom });

                    // 🔥 DÉSTOCKAGE DU PRODUIT AVEC CONVERSION
                    if (produitDb.isManufactured && produitDb.recipe && produitDb.recipe.length > 0) {
                        for (let comp of produitDb.recipe) {
                            let queryIng = !isNaN(comp.ingredientId) ? { id: Number(comp.ingredientId) } : { _id: comp.ingredientId };
                            const ingDb = await Product.findOne({ cafeId: req.cafeId, ...queryIng });
                            
                            if (ingDb) {
                                const qteBase = (comp.quantity || 0) * qteCmd;
                                const qteADeduireTotal = calculerQuantiteDestockage(qteBase, comp.unit || 'g', ingDb.unite || 'g');

                                const ing = await Product.findOneAndUpdate(
                                    { cafeId: req.cafeId, ...queryIng },
                                    { $inc: { stock: -qteADeduireTotal } },
                                    { new: true }
                                );
                                if (ing) {
                                    await new Movement({
                                        cafeId: req.cafeId, type: 'commande', produit: ing.nom, produitId: ing.id || ing._id,
                                        quantite: qteADeduireTotal, ancienStock: ing.stock + qteADeduireTotal, nouveauStock: ing.stock,
                                        raison: `Composant de : ${produitDb.nom}`
                                    }).save();
                                }
                            }
                        }
                    } else if (produitDb.stock !== undefined && !produitDb.isManufactured) {
                        const updateSimple = await Product.findOneAndUpdate(
                            { cafeId: req.cafeId, id: produitDb.id || produitDb._id }, 
                            { $inc: { stock: -qteCmd } }, 
                            { new: true }
                        );
                        if (updateSimple) {
                            await new Movement({ 
                                cafeId: req.cafeId, type: 'commande', produit: updateSimple.nom, produitId: updateSimple.id || updateSimple._id, 
                                quantite: qteCmd, ancienStock: updateSimple.stock + qteCmd, nouveauStock: updateSimple.stock, 
                                raison: `Cmd directe #${numeroCmd}` 
                            }).save();
                        }
                    }
                } else {
                    totalSecurise += (art.prix * qteCmd);
                    articlesSecurises.push(art);
                }
            }
        }
        totalSecurise = parseFloat(totalSecurise.toFixed(2));
        
        io.to(req.cafeId).emit('update_stock');

        // 🔥 GESTION DES PAIEMENTS VIP
        let messageBonus = null;
        if (req.body.methodePaiement === 'carte_fidelite') {
            const clientVIP = await LoyalCustomer.findOne({ cafeId: req.cafeId, codeFidelite: codeEnvoye });
            if (!clientVIP) return res.status(403).json({ error: "Carte non reconnue." });
            if (clientVIP.solde < totalSecurise) return res.status(400).json({ error: `Solde insuffisant.` });

            clientVIP.solde = parseFloat((clientVIP.solde - totalSecurise).toFixed(2));
            clientVIP.points = parseFloat(((clientVIP.points || 0) + totalSecurise).toFixed(2));
            messageBonus = `✨ Vous avez gagné ${totalSecurise.toFixed(2)} points fidélité !`;
            await clientVIP.save();

            await new Sale({
                cafeId: req.cafeId, id: cmdId, numero: numeroCmd, total: totalSecurise, remise: 0,
                typePaiement: 'complet', methodePaiement: 'Carte Fidélité',
                tableOrigine: `Fidèle : ${clientVIP.prenom} ${clientVIP.nom}`, articles: articlesSecurises,
                date: new Date().toLocaleString('fr-FR'), timestamp: Date.now()
            }).save();
        } else if (codeEnvoye && codeEnvoye !== vraiCodeServeur) {
            const clientVIP = await LoyalCustomer.findOne({ cafeId: req.cafeId, codeFidelite: codeEnvoye });
            if (clientVIP) {
                clientVIP.points = parseFloat(((clientVIP.points || 0) + totalSecurise).toFixed(2));
                messageBonus = `✨ Vous avez gagné ${totalSecurise.toFixed(2)} points !`;
                await clientVIP.save();
            }
        }

        const isEnLigne = req.body.methodePaiement === 'en_ligne';
        const cmd = new Order({ 
            ...req.body, cafeId: req.cafeId, articles: articlesSecurises, id: cmdId, numero: numeroCmd, 
            date: new Date().toLocaleString('fr-FR'), timestamp: Date.now(), total: totalSecurise, statut: isEnLigne ? 'attente_paiement' : 'en_attente' 
        });
        await cmd.save();

        if (isEnLigne) return res.status(201).json({ ...cmd._doc, payUrl: `/api/simulateur-paiement/${cmdId}`, bonusInfo: messageBonus });

        io.to(req.cafeId).emit('nouvelle_commande', cmd);
        res.status(201).json({ ...cmd._doc, bonusInfo: messageBonus });

    } catch (err) { 
        console.error("Erreur Commande:", err);
        res.status(500).json({ error: err.message }); 
    }
});
app.post('/api/customers/convertir-points', verifierToken, async (req, res) => {
    try {
        const { codeFidelite } = req.body;
        const client = await LoyalCustomer.findOne({ cafeId: req.cafeId, codeFidelite });
        if (!client) return res.status(404).json({ error: "Client introuvable" });

        let configFid = await StoreSettings.findOne({ cafeId: req.cafeId, type: 'fidelite' });
        const pRequis = (configFid && configFid.pointsRequis) ? configFid.pointsRequis : 100;
        const vCredit = (configFid && configFid.valeurCredit) ? configFid.valeurCredit : 5;
        
        if (client.points < pRequis) return res.status(400).json({ error: `Pas assez de points.` });

        const nbConversions = Math.floor(client.points / pRequis);
        const pointsAConsommer = nbConversions * pRequis;
        const argentGagne = nbConversions * vCredit;

        client.points = parseFloat((client.points - pointsAConsommer).toFixed(2));
        client.solde = parseFloat((client.solde + argentGagne).toFixed(2));
        await client.save();

        res.json({ success: true, message: "Convertis!", solde: client.solde, pointsRestants: client.points });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/mes-commandes/:clientId', async (req, res) => {
    try {
        const commandes = await Order.find({ cafeId: req.cafeId, clientId: req.params.clientId, statut: { $ne: 'paye' } });
        res.json(commandes.map(c => ({ id: c.id, statut: c.statut })));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/fidelite/identifier/:code', async (req, res) => {
    try {
        const client = await LoyalCustomer.findOne({ cafeId: req.cafeId, codeFidelite: req.params.code });
        if (client) res.json({ success: true, nomComplet: `${client.prenom} ${client.nom}` });
        else res.status(404).json({ success: false, message: "Client non reconnu" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// =========================================================
// 🚀 SIMULATEUR PAIEMENT & WEBHOOKS
// =========================================================
app.get('/api/simulateur-paiement/:orderId', async (req, res) => {
    try {
        const commande = await Order.findOne({ cafeId: req.cafeId, id: req.params.orderId });
        if (!commande || commande.statut !== 'attente_paiement') return res.send("Erreur.");

        commande.statut = 'en_attente';
        await commande.save();

for (let art of commande.articles) {
            // 🔥 Sécurisation de l'ID ici aussi
            if (art.id && !isNaN(art.id)) {
                const produitMisAJour = await Product.findOneAndUpdate(
                    { cafeId: req.cafeId, id: Number(art.id) }, { $inc: { stock: -art.quantite } }, { new: true }
                );

                if (produitMisAJour && produitMisAJour.stock !== undefined) {
                    await new Movement({ 
                        cafeId: req.cafeId, type: 'vente_web', produit: produitMisAJour.nom, produitId: produitMisAJour.id, 
                        quantite: art.quantite, ancienStock: produitMisAJour.stock + art.quantite,
                        nouveauStock: produitMisAJour.stock, raison: `Commande WEB #${commande.numero}` 
                    }).save();
                }
            }
        }

        await new Sale({
            cafeId: req.cafeId, id: Date.now().toString(), numero: commande.numero,
            total: commande.total, remise: 0, typePaiement: 'complet', methodePaiement: 'en_ligne',
            tableOrigine: `WEB - ${commande.numeroTable}`, articles: commande.articles
        }).save();

        io.to(req.cafeId).emit('nouvelle_commande', commande);
        io.to(req.cafeId).emit('update_stock');

        res.send(`<h1 style="text-align:center; margin-top:50px;">Paiement Réussi ! <a href="/">Retour</a></h1>`);
    } catch (err) { res.status(500).send("Erreur: " + err.message); }
});

app.post('/api/webhook/paiement', async (req, res) => {
    // Le webhook conserve la même logique, on s'assure juste d'utiliser req.cafeId
    // ... (Pour la concision, applique req.cafeId aux appels Mongoose comme ci-dessus)
});

app.get('/api/numbers', async (req, res) => {
    try { res.json(await TableCode.find({ cafeId: req.cafeId }).sort({ numero: 1 })); } 
    catch (err) { res.status(500).json(err); }
});

// =========================================================
// ========== 5. ROUTES API SÉCURISÉES =================
// =========================================================

app.get('/api/tickets-ouverts', verifierToken, async (req, res) => {
    try { res.json(await OpenTicket.find({ cafeId: req.cafeId })); } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/tickets-ouverts', verifierToken, async (req, res) => {
    try {
        await OpenTicket.findOneAndUpdate(
            { cafeId: req.cafeId, tableNum: req.body.tableNum },
            { ticketData: req.body.ticketData, lastUpdated: Date.now() },
            { upsert: true, new: true }
        );
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/customers', verifierToken, async (req, res) => {
    try { res.json(await LoyalCustomer.find({ cafeId: req.cafeId }).sort({ _id: -1 })); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/customers', verifierToken, async (req, res) => {
    try {
        const nouveau = new LoyalCustomer({ ...req.body, cafeId: req.cafeId });
        await nouveau.save(); 
        res.json({ success: true, customer: nouveau });
    } catch (err) { res.status(500).json({ error: "Erreur serveur" }); }
});

app.delete('/api/customers/:id', verifierToken, async (req, res) => {
    try {
        await LoyalCustomer.findOneAndDelete({ _id: req.params.id, cafeId: req.cafeId });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/customers/verify/:code', async (req, res) => {
    try {
        const customer = await LoyalCustomer.findOne({ cafeId: req.cafeId, codeFidelite: req.params.code });
        if (customer) res.json({ success: true, customer });
        else res.status(404).json({ success: false });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/commandes', verifierToken, async (req, res) => {
    try { res.json(await Order.find({ cafeId: req.cafeId, statut: { $ne: 'paye' } })); } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/commandes/:id/statut', verifierToken, async (req, res) => {
    try {
        const cmd = await Order.findOneAndUpdate({ cafeId: req.cafeId, id: req.params.id }, { statut: req.body.statut }, { new: true });
        io.to(req.cafeId).emit('mise_a_jour_commande', cmd);
        res.json(cmd);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/commandes/table/:numeroTable/paye', verifierToken, async (req, res) => {
    try {
        const commandes = await Order.find({ cafeId: req.cafeId, numeroTable: req.params.numeroTable, statut: { $ne: 'paye' } });
        for (let cmd of commandes) {
            cmd.statut = 'paye';
            await cmd.save();
            io.to(req.cafeId).emit('mise_a_jour_commande', cmd);
        }
        res.json({ success: true, effacees: commandes.length });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/tiroir/statut', verifierToken, async (req, res) => {
    try {
        const session = await CashRegister.findOne({ cafeId: req.cafeId, statut: 'ouvert' });
        res.json({ ouvert: !!session, session });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/tiroir/ouvrir', verifierToken, async (req, res) => {
    try {
        const dejaOuvert = await CashRegister.findOne({ cafeId: req.cafeId, statut: 'ouvert' });
        if (dejaOuvert) return res.status(400).json({ error: "Une session est déjà ouverte." });

        const session = new CashRegister({ cafeId: req.cafeId, fondDeCaisse: req.body.fond });
        await session.save();
        res.json({ success: true, session });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/tiroir/fermer', verifierToken, async (req, res) => {
    try {
        const session = await CashRegister.findOne({ cafeId: req.cafeId, statut: 'ouvert' });
        if (!session) return res.status(400).json({ error: "Aucune caisse ouverte" });

        const ventes = await Sale.find({ 
            cafeId: req.cafeId, timestamp: { $gte: session.timestampOuverture },
            methodePaiement: { $in: ['especes', 'carte', 'ticket_resto'] } 
        });

        let totalEspeces = 0, totalCarte = 0, totalTicketResto = 0;
        ventes.forEach(v => {
            if (v.methodePaiement === 'carte') totalCarte += v.total;
            else if (v.methodePaiement === 'ticket_resto') totalTicketResto += v.total;
            else totalEspeces += v.total;
        });

        const depenses = await Expense.find({ cafeId: req.cafeId, timestamp: { $gte: session.timestampOuverture }, modePaiement: 'especes' });
        const totalSorties = depenses.reduce((sum, d) => sum + (d.montantPaye || d.montant || 0), 0);

        const totalEntrees = totalEspeces + totalCarte + totalTicketResto;
        const attendu = session.fondDeCaisse + totalEntrees - totalSorties;
        const ecart = req.body.reel - attendu;

        session.dateFermeture = new Date().toLocaleString('fr-FR');
        session.totalVentesEspeces = totalEspeces; 
        session.especesReelles = req.body.reel;
        session.ecart = ecart; session.statut = 'ferme';
        await session.save();

        res.json({ success: true, session, attendu, totalSorties, totalEspeces, totalCarte, totalTicketResto });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/stock', verifierToken, async (req, res) => {
    try {
        const nouveau = new Product({ ...req.body, cafeId: req.cafeId, id: Date.now() });
        await nouveau.save();
        io.to(req.cafeId).emit('update_stock'); 
        res.json({ success: true, produit: nouveau });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/stock/:id', verifierToken, async (req, res) => {
    try {
        const misAJour = await Product.findOneAndUpdate({ cafeId: req.cafeId, id: req.params.id }, req.body, { new: true });
        io.to(req.cafeId).emit('update_stock'); 
        res.json({ success: true, produit: misAJour });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/stock/:id', verifierToken, async (req, res) => {
    try {
        await Product.findOneAndUpdate({ cafeId: req.cafeId, id: req.params.id }, { actif: false });
        io.to(req.cafeId).emit('update_stock'); 
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/stock/:id/add', verifierToken, async (req, res) => {
    try {
        const p = await Product.findOne({ cafeId: req.cafeId, id: req.params.id });
        if (p) {
            const ancien = p.stock; p.stock += parseInt(req.body.quantite);
            await p.save();
            await new Movement({ cafeId: req.cafeId, type: 'ajout', produit: p.nom, produitId: p.id, quantite: req.body.quantite, ancienStock: ancien, nouveauStock: p.stock, raison: req.body.raison || 'Réception' }).save();
            io.to(req.cafeId).emit('update_stock'); 
            res.json({ success: true });
        } else { res.status(404).json({ error: "Produit introuvable" }); }
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/stock/decrementer', verifierToken, async (req, res) => {
    try {
        for (let art of req.body.articles) {
            // 🔥 SÉCURITÉ AJOUTÉE ICI
            if (art.id && !isNaN(art.id)) {
                const p = await Product.findOneAndUpdate(
                    { cafeId: req.cafeId, id: Number(art.id), stock: { $exists: true } }, 
                    { $inc: { stock: -art.quantite } }, { new: true }
                );
                if (p) {
                    await new Movement({ 
                        cafeId: req.cafeId, type: 'vente', produit: p.nom, produitId: art.id, 
                        quantite: art.quantite, nouveauStock: p.stock, ancienStock: p.stock + art.quantite, raison: "Vente" 
                    }).save();
                }
            }
        }
        io.to(req.cafeId).emit('update_stock');
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/stock/historique', verifierToken, async (req, res) => {
    try { res.json(await Movement.find({ cafeId: req.cafeId }).sort({ _id: -1 }).limit(100)); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/stock/inventaires', verifierToken, async (req, res) => {
    try { res.json(await Inventory.find({ cafeId: req.cafeId }).sort({ _id: -1 })); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/stock/inventaire', verifierToken, async (req, res) => {
    try {
        const { produits } = req.body; const ecarts = [];
        for (let p of produits) {
            const dbP = await Product.findOne({ cafeId: req.cafeId, id: p.id });
            if (dbP) {
                const ancien = dbP.stock; dbP.stock = p.stockPhysique; await dbP.save();
                ecarts.push({ produit: dbP.nom, ancien, nouveau: p.stockPhysique, ecart: p.stockPhysique - ancien });
            }
        }
        await new Inventory({ cafeId: req.cafeId, ecarts }).save();
        io.to(req.cafeId).emit('update_stock'); 
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/depenses', verifierToken, async (req, res) => {
    try { res.json(await Expense.find({ cafeId: req.cafeId }).sort({ _id: -1 })); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/depenses', verifierToken, async (req, res) => { 
    try { await new Expense({ ...req.body, cafeId: req.cafeId }).save(); res.json({ success: true }); } 
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/depenses/:id', verifierToken, async (req, res) => {
    try { await Expense.findOneAndDelete({ _id: req.params.id, cafeId: req.cafeId }); res.json({ success: true }); } 
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/depenses/:id', verifierToken, async (req, res) => {
    try { const misAJour = await Expense.findOneAndUpdate({ _id: req.params.id, cafeId: req.cafeId }, req.body, { new: true }); res.json({ success: true, depense: misAJour }); } 
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/settings/fidelite', async (req, res) => {
    try {
        let config = await StoreSettings.findOne({ cafeId: req.cafeId, type: 'fidelite' });
        if (!config) config = await new StoreSettings({ cafeId: req.cafeId, type: 'fidelite', pointsRequis: 100, valeurCredit: 5 }).save();
        res.json(config);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/settings/fidelite', verifierToken, async (req, res) => {
    try {
        const { pointsRequis, valeurCredit } = req.body;
        const config = await StoreSettings.findOneAndUpdate(
            { cafeId: req.cafeId, type: 'fidelite' }, { pointsRequis, valeurCredit }, { new: true, upsert: true }
        );
        res.json({ success: true, config });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/numbers/refresh/:numero', async (req, res) => {
    try {
        const updated = await TableCode.findOneAndUpdate(
            { cafeId: req.cafeId, numero: req.params.numero }, 
            { code: Math.floor(Math.random()*90000+10000).toString(), lastUpdated: Date.now() }, 
            { upsert: true, new: true }
        );
        res.json(updated);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/ventes', verifierToken, async (req, res) => {
    try { res.json(await Sale.find({ cafeId: req.cafeId }).sort({ timestamp: -1 })); } 
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/ventes', verifierToken, async (req, res) => {
    try {
        if (req.body.id) {
            const venteExistante = await Sale.findOne({ cafeId: req.cafeId, id: req.body.id.toString() });
            if (venteExistante) return res.json({ success: true, message: "Vente ignorée" });
        }

        let vraiTotalReel = 0;
        let articlesSecurises = [];

        for (let art of req.body.articles) {
            let nomPropre = art.nom || "";
            if (nomPropre.startsWith('+ ')) nomPropre = nomPropre.substring(2).trim();
            const nomBaseRecherche = nomPropre.split('(')[0].trim();
            const qteCmd = parseInt(art.quantite) || 1;
            
            // 🔥 ANTI-DOUBLE DÉSTOCKAGE
            const estDejaDestocke = art.envoye === true || !!art.cmdId;

            // ==========================================
            // CAS 1 : C'EST UN SUPPLÉMENT
            // ==========================================
            if (art.isSupplement && art.parentId) {
                const parentArticle = req.body.articles.find(a => String(a.uniqueGroupId) === String(art.parentId) || String(a.id) === String(art.parentId));
                let parentDb = null;
                
                if (parentArticle) {
                    const idParent = parentArticle.baseId || parentArticle.id;
                    if (idParent && !isNaN(idParent)) parentDb = await Product.findOne({ cafeId: req.cafeId, id: Number(idParent) });
                    else if (idParent && mongoose.Types.ObjectId.isValid(idParent)) parentDb = await Product.findOne({ cafeId: req.cafeId, _id: idParent });
                    if (!parentDb) parentDb = await Product.findOne({ cafeId: req.cafeId, nom: parentArticle.nom.split('(')[0].trim() });
                }

                if (parentDb && parentDb.supplements) {
                    const configSupp = parentDb.supplements.find(s => s.nom === art.nom || s.nom === nomPropre);
                    let prixApplique = art.prix;
                    
                    // 🔥 LECTURE DU PRIX PROMO DU SUPPLÉMENT
                    if (configSupp) {
                        if (configSupp.prixPromo && configSupp.prixPromo > 0) prixApplique = configSupp.prixPromo;
                        else if (configSupp.prix !== undefined) prixApplique = configSupp.prix;
                    }
                    
                    vraiTotalReel += (prixApplique * qteCmd);
                    articlesSecurises.push({ ...art, prix: prixApplique });

                    // DÉSTOCKAGE DU SUPPLÉMENT
                    if (configSupp && configSupp.ingredientId && !estDejaDestocke) {
                        let queryIng = !isNaN(configSupp.ingredientId) ? { id: Number(configSupp.ingredientId) } : { _id: configSupp.ingredientId };
                        const qteADeduireTotal = (configSupp.quantiteADeduire || 0) * qteCmd; 

                        const ing = await Product.findOneAndUpdate(
                            { cafeId: req.cafeId, ...queryIng },
                            { $inc: { stock: -qteADeduireTotal } },
                            { new: true }
                        );
                        if (ing) {
                            await new Movement({
                                cafeId: req.cafeId, type: 'vente', produit: ing.nom, produitId: ing.id || ing._id,
                                quantite: qteADeduireTotal, ancienStock: ing.stock + qteADeduireTotal, nouveauStock: ing.stock,
                                raison: `Supplément : ${nomPropre} pour ${parentDb.nom}`
                            }).save();
                        }
                    }
                } else {
                    vraiTotalReel += (art.prix * qteCmd);
                    articlesSecurises.push(art);
                }
            } 
            // ==========================================
            // CAS 2 : C'EST UN PRODUIT (Matière ou Recette)
            // ==========================================
            else {
                let produitDb = null;
                const idSrc = art.baseId || art.id;
                
                if (idSrc && !isNaN(idSrc)) produitDb = await Product.findOne({ cafeId: req.cafeId, id: Number(idSrc) });
                else if (idSrc && mongoose.Types.ObjectId.isValid(idSrc)) produitDb = await Product.findOne({ cafeId: req.cafeId, _id: idSrc });
                if (!produitDb) produitDb = await Product.findOne({ cafeId: req.cafeId, nom: nomBaseRecherche });

                if (produitDb) {
                    let prixBaseDb = (produitDb.prixPromo && produitDb.prixPromo > 0) ? produitDb.prixPromo : produitDb.prix;
                    vraiTotalReel += (prixBaseDb * qteCmd);
                    articlesSecurises.push({ ...art, prix: prixBaseDb, id: produitDb.id || produitDb._id, baseId: produitDb.id || produitDb._id, nom: produitDb.nom });

                    // DÉSTOCKAGE DU PRODUIT
                    if (!estDejaDestocke) {
                        if (produitDb.isManufactured && produitDb.recipe && produitDb.recipe.length > 0) {
                            for (let comp of produitDb.recipe) {
                                let queryIng = !isNaN(comp.ingredientId) ? { id: Number(comp.ingredientId) } : { _id: comp.ingredientId };
                                const qteADeduireTotal = (comp.quantity || 0) * qteCmd; 

                                const ing = await Product.findOneAndUpdate(
                                    { cafeId: req.cafeId, ...queryIng },
                                    { $inc: { stock: -qteADeduireTotal } },
                                    { new: true }
                                );
                                if (ing) {
                                    await new Movement({
                                        cafeId: req.cafeId, type: 'vente', produit: ing.nom, produitId: ing.id || ing._id,
                                        quantite: qteADeduireTotal, ancienStock: ing.stock + qteADeduireTotal, nouveauStock: ing.stock,
                                        raison: `Composant de : ${produitDb.nom}`
                                    }).save();
                                }
                            }
                        } else if (produitDb.stock !== undefined && !produitDb.isManufactured) {
                            const updateSimple = await Product.findOneAndUpdate(
                                { cafeId: req.cafeId, id: produitDb.id || produitDb._id }, 
                                { $inc: { stock: -qteCmd } }, 
                                { new: true }
                            );
                            if (updateSimple) {
                                await new Movement({ 
                                    cafeId: req.cafeId, type: 'vente', produit: updateSimple.nom, produitId: updateSimple.id || updateSimple._id, 
                                    quantite: qteCmd, ancienStock: updateSimple.stock + qteCmd, nouveauStock: updateSimple.stock, 
                                    raison: `Vente directe` 
                                }).save();
                            }
                        }
                    }
                } else {
                    vraiTotalReel += (art.prix * qteCmd);
                    articlesSecurises.push(art);
                }
            }
        }

        if (req.body.remise && req.body.remise > 0) vraiTotalReel = vraiTotalReel * (1 - (req.body.remise / 100));

        // 🔥 LOGIQUE VIP (SANS CRASH)
        if (req.body.methodePaiement === 'carte_fidelite') {
            const codeClient = req.body.clientId; // La caisse envoie clientId
            const clientVIP = await LoyalCustomer.findOne({ cafeId: req.cafeId, codeFidelite: codeClient });
            if (!clientVIP) return res.status(403).json({ error: "Carte non reconnue." });
            if (clientVIP.solde < vraiTotalReel) return res.status(400).json({ error: `Solde insuffisant.` });

            clientVIP.solde = parseFloat((clientVIP.solde - vraiTotalReel).toFixed(2));
            clientVIP.points = parseFloat(((clientVIP.points || 0) + vraiTotalReel).toFixed(2)); // 🔥 GAGNE SES POINTS
            await clientVIP.save();
        }

        await new Sale({ ...req.body, articles: articlesSecurises, cafeId: req.cafeId, total: vraiTotalReel }).save();
        io.to(req.cafeId).emit('update_stock');
        res.json({ success: true, totalSecurise: vraiTotalReel });

    } catch (err) {
        console.error("Erreur Vente:", err);
        res.status(500).json({ error: err.message });
    }
});
app.post('/api/commandes/annuler-article-unique', verifierToken, async (req, res) => {
    try {
        const { orderId, uniqueGroupId } = req.body;
        const commande = await Order.findOne({ cafeId: req.cafeId, id: orderId });
        if (!commande) return res.status(404).json({ error: "Commande introuvable" });

        const doitRestituerStock = (commande.statut === 'en_attente');
        const itemsDuGroupe = commande.articles.filter(a => 
            String(a.uniqueGroupId) === String(uniqueGroupId) || String(a.parentId) === String(uniqueGroupId)
        );

        if (doitRestituerStock) {
            for (let art of itemsDuGroupe) {
                let nomPropre = art.nom || "";
                if (nomPropre.startsWith('+ ')) nomPropre = nomPropre.substring(2).trim();

                const idRecherche = art.baseId || art.id;
                let conditions = [];
                if (idRecherche && !isNaN(idRecherche)) conditions.push({ id: Number(idRecherche) });
                if (idRecherche && mongoose.Types.ObjectId.isValid(idRecherche)) conditions.push({ _id: idRecherche });
                
                let produitDb = conditions.length > 0 ? await Product.findOne({ cafeId: req.cafeId, $or: conditions }) : null;
                if (!produitDb) produitDb = await Product.findOne({ cafeId: req.cafeId, nom: nomPropre.split('(')[0].trim() });

                if (produitDb) {
                    // SI C'EST UN SUPPLÉMENT (Il a un parentId)
                    if (art.isSupplement && art.parentId) {
                        const configSupp = produitDb.supplements?.find(s => s.nom === nomPropre);
                        if (configSupp && configSupp.ingredientId) {
                            const qIng = !isNaN(configSupp.ingredientId) ? { id: Number(configSupp.ingredientId) } : { _id: configSupp.ingredientId };
                            const ingDb = await Product.findOne({ cafeId: req.cafeId, ...qIng });
                            if (ingDb) {
                                // Conversion pour 1 seule unité
                                const qteARendre = calculerQuantiteDestockage((configSupp.quantiteADeduire || 0) * 1, configSupp.unite || 'g', ingDb.unite || 'g');
                                await Product.findOneAndUpdate({ cafeId: req.cafeId, ...qIng }, { $inc: { stock: qteARendre } });
                            }
                        }
                    } 
                    // SI C'EST UN PLAT AVEC RECETTE
                    else if (produitDb.isManufactured && produitDb.recipe) {
                        for (let comp of produitDb.recipe) {
                            const qIng = !isNaN(comp.ingredientId) ? { id: Number(comp.ingredientId) } : { _id: comp.ingredientId };
                            const ingDb = await Product.findOne({ cafeId: req.cafeId, ...qIng });
                            if (ingDb) {
                                // Conversion pour 1 seule unité
                                const qteARendre = calculerQuantiteDestockage((comp.quantity || 0) * 1, comp.unit || 'g', ingDb.unite || 'g');
                                await Product.findOneAndUpdate({ cafeId: req.cafeId, ...qIng }, { $inc: { stock: qteARendre } });
                            }
                        }
                    } 
                    // SI C'EST UN PRODUIT SIMPLE (Ex: Canette)
                    else {
                        await Product.findOneAndUpdate({ cafeId: req.cafeId, _id: produitDb._id }, { $inc: { stock: 1 } });
                    }
                }
            }
        }

        // On baisse la quantité de 1
        for (let art of commande.articles) {
            if (String(art.uniqueGroupId) === String(uniqueGroupId) || String(art.parentId) === String(uniqueGroupId)) {
                art.quantite -= 1;
            }
        }

        // Nettoyage
        commande.articles = commande.articles.filter(a => a.quantite > 0);
        
        if (commande.articles.length === 0) {
            await Order.deleteOne({ cafeId: req.cafeId, id: orderId });
            io.to(req.cafeId).emit('mise_a_jour_commande', { id: orderId, statut: 'annulee' });
        } else {
            commande.total = commande.articles.reduce((sum, a) => sum + (a.prix * a.quantite), 0);
            await commande.save();
            io.to(req.cafeId).emit('mise_a_jour_commande', commande);
        }

        io.to(req.cafeId).emit('update_stock');
        res.json({ success: true });
    } catch (err) {
        console.error("Erreur annulation unique:", err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/commandes/annuler-logique', verifierToken, async (req, res) => {
    try {
        const { orderIds } = req.body;
        if (!orderIds || orderIds.length === 0) return res.json({ success: true });

        for (let orderId of orderIds) {
            const commande = await Order.findOne({ cafeId: req.cafeId, id: orderId });
            if (!commande) continue;

            if (commande.statut === 'en_attente') {
                for (let art of commande.articles) {
                    const qteCmd = parseInt(art.quantite) || 1;
                    let nomPropre = art.nom || "";
                    if (nomPropre.startsWith('+ ')) nomPropre = nomPropre.substring(2).trim();
                    
                    if (art.isSupplement && art.parentId) {
                        const parentArticle = commande.articles.find(a => String(a.uniqueGroupId) === String(art.parentId));
                        const idParent = parentArticle?.baseId || parentArticle?.id;
                        let parentDb = null;
                        if (idParent) parentDb = await Product.findOne({ cafeId: req.cafeId, $or: [{ id: Number(idParent) }, { _id: idParent }] });
                        
                        const configSupp = parentDb?.supplements?.find(s => s.nom === nomPropre);
                        
                        if (configSupp?.ingredientId) {
                            const queryIng = !isNaN(configSupp.ingredientId) ? { id: Number(configSupp.ingredientId) } : { _id: configSupp.ingredientId };
                            const ingDb = await Product.findOne({ cafeId: req.cafeId, ...queryIng });
                            if (ingDb) {
                                // Conversion avec la quantité totale
                                const qteARendre = calculerQuantiteDestockage((configSupp.quantiteADeduire || 0) * qteCmd, configSupp.unite || 'g', ingDb.unite || 'g');
                                await Product.findOneAndUpdate({ cafeId: req.cafeId, ...queryIng }, { $inc: { stock: qteARendre } });
                            }
                        }
                    } else {
                        const idSrc = art.baseId || art.id;
                        let pDb = null;
                        if (idSrc) pDb = await Product.findOne({ cafeId: req.cafeId, $or: [{ id: Number(idSrc) }, { _id: idSrc }] });
                        
                        if (pDb) {
                            if (pDb.isManufactured && pDb.recipe) {
                                for (let comp of pDb.recipe) {
                                    const qIng = !isNaN(comp.ingredientId) ? { id: Number(comp.ingredientId) } : { _id: comp.ingredientId };
                                    const ingDb = await Product.findOne({ cafeId: req.cafeId, ...qIng });
                                    if (ingDb) {
                                        // Conversion avec la quantité totale
                                        const qteARendre = calculerQuantiteDestockage((comp.quantity || 0) * qteCmd, comp.unit || 'g', ingDb.unite || 'g');
                                        await Product.findOneAndUpdate({ cafeId: req.cafeId, ...qIng }, { $inc: { stock: qteARendre } });
                                    }
                                }
                            } else {
                                await Product.findOneAndUpdate({ cafeId: req.cafeId, id: pDb.id || pDb._id }, { $inc: { stock: qteCmd } });
                            }
                        }
                    }
                }
            }
            await Order.deleteOne({ cafeId: req.cafeId, id: orderId });
            io.to(req.cafeId).emit('mise_a_jour_commande', { id: orderId, statut: 'annulee' });
        }
        io.to(req.cafeId).emit('update_stock');
        res.json({ success: true, message: "Traitement terminé" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});
app.put('/api/commandes/partiel-ids', verifierToken, async (req, res) => {
    try {
        const { orderIds, articlesRestants } = req.body;
        if (!orderIds || orderIds.length === 0) return res.json({ success: true });

        const commandes = await Order.find({ cafeId: req.cafeId, id: { $in: orderIds }, statut: { $ne: 'paye' } });
        if (commandes.length === 0) return res.json({ success: true });

        if (articlesRestants.length === 0) {
            for (let cmd of commandes) {
                cmd.statut = 'paye'; await cmd.save(); io.to(req.cafeId).emit('mise_a_jour_commande', cmd);
            }
        } else {
            const cmdPrincipale = commandes[0];
            cmdPrincipale.articles = articlesRestants;
            cmdPrincipale.total = articlesRestants.reduce((s, a) => s + (a.prix * a.quantite), 0);
            await cmdPrincipale.save();
            io.to(req.cafeId).emit('mise_a_jour_commande', cmdPrincipale);

            for (let i = 1; i < commandes.length; i++) {
                commandes[i].statut = 'paye'; await commandes[i].save();
                io.to(req.cafeId).emit('mise_a_jour_commande', commandes[i]);
            }
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/customers/recharge', verifierToken, async (req, res) => {
    try {
        const { codeFidelite, montant } = req.body;
        const client = await LoyalCustomer.findOne({ cafeId: req.cafeId, codeFidelite });
        if (!client) return res.status(404).json({ error: "Client introuvable" });

        client.solde += parseFloat(montant); 
        await client.save();
        res.json({ success: true, solde: client.solde });
    } catch (err) { res.status(500).json({ error: err.message }); }
});
// ========== AIGUILLAGE DU DOMAINE PRINCIPAL ==========
app.get('/', verifierExistenceCafe, (req, res) => {
    
    // Si l'utilisateur tape "sarbini.click" ou "www.sarbini.click"
    if (req.cafeId === 'sarbini') {
        // On lui envoie la belle Landing Page SaaS
        res.sendFile(path.join(__dirname, 'public', 'landing.html'));
    } 
    // Si c'est un sous-domaine de client (ex: titos.sarbini.click)
    else {
        // On lui envoie l'application de commande du café (Menu/Panier/Scanner)
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }
    
});
// ========== 6. INITIALISATION ==========
async function seedDatabase() {
    try {
        // En mode SaaS, on n'injecte un menu que pour un café "demo" s'il est vide.
        const count = await Product.countDocuments({ cafeId: 'demo' });
        if (count === 0) {
            await Product.insertMany([
                { cafeId: 'demo', id: 1, nom: "Espresso", stock: 200, prixAchat: 0.8, prix: 2.5, unite: "tasse", categorie: "cafe", seuilAlerte: 20 }
            ]);
            console.log("✅ Menu de Démo injecté !");
        }
    } catch (err) { console.error("Erreur de Seed:", err); }
}

// ========== 7. DÉMARRAGE DU SERVEUR ==========
mongoose.connection.once('open', () => {
    server.listen(PORT, () => {
        console.log(`🚀 Sarbini SaaS Engine Online !`);
        console.log(`📍 Port : ${PORT}`);
        seedDatabase();
    });
});