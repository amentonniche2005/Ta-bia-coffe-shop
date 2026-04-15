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
const CAISSE_TOKEN = process.env.CAISSE_TOKEN || '12345678';

// 🔥 SÉCURITÉ WEBSOCKET
io.use((socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.headers['authorization'];
    if (token === CAISSE_TOKEN || socket.handshake.query.clientType === 'customer') {
        next();
    } else {
        next(new Error("Accès WebSocket refusé. Token invalide."));
    }
});

// ========== 1. CONNEXION MONGODB ATLAS ==========
const mongoURI = process.env.MONGODB_URI;
// =================================================================
// 🔥 DÉFINITION DES MODÈLES DE BASE DE DONNÉES (Mongoose Schemas)
// =================================================================

// 1. Modèle pour les Sessions de Caisse (Ouverture / Fermeture Z)
const sessionCaisseSchema = new mongoose.Schema({
    dateOuverture: { type: Date, default: Date.now },
    fondDeCaisse: { type: Number, default: 0 },
    statut: { type: String, default: 'ouverte' }, // 'ouverte' ou 'fermee'
    dateFermeture: { type: Date },
    totalVentesEspeces: { type: Number, default: 0 },
    especesReelles: { type: Number, default: 0 },
    ecart: { type: Number, default: 0 },
    caTotalSession: { type: Number, default: 0 }
});
const SessionCaisse = mongoose.model('SessionCaisse', sessionCaisseSchema);

// 2. Modèle pour les Ventes (Tickets encaissés)
const venteSchema = new mongoose.Schema({
    id: { type: String, required: true },
    numero: { type: String },
    total: { type: Number, required: true },
    remise: { type: Number, default: 0 },
    typePaiement: { type: String }, // complet ou partiel
    tableOrigine: { type: String },
    methodePaiement: { type: String, default: 'especes' }, // especes, carte, en_ligne, carte_fidelite...
    articles: { type: Array, default: [] },
    timestamp: { type: Number, default: () => Date.now() },
    date: { type: String, default: () => new Date().toLocaleString('fr-FR') }
});
// Vérifier si le modèle Vente existe déjà pour éviter de le recréer
const Vente = mongoose.models.Vente || mongoose.model('Vente', venteSchema);
mongoose.connect(mongoURI)
    .then(() => console.log("🚀 TA'BIA DB : Connectée avec succès !"))
    .catch(err => { 
        console.error("❌ Erreur critique de connexion DB:", err); 
        process.exit(1); 
    });

// ========== 2. MODÈLES DE DONNÉES (SCHÉMAS) ==========

const Product = mongoose.model('Product', new mongoose.Schema({
    id: Number, 
    nom: String, 
    prix: Number, // Prix de vente
    prixAchat: { type: Number, default: 0 }, // 🔴 NOUVEAU : Le prix que tu paies
    stock: Number, 
    categorie: String, 
    image: { type: String, default: 'https://via.placeholder.com/150' },
    variantes: { type: String, default: "" }, 
    typeChoix: { type: String, default: "unique" },
    seuilAlerte: { type: Number, default: 10 }, 
    unite: String,
    actif: { type: Boolean, default: true }
}));

const Movement = mongoose.model('Movement', new mongoose.Schema({
    date: { type: String, default: () => new Date().toLocaleString('fr-FR') },
    type: String, produit: String, produitId: Number, quantite: Number,
    ancienStock: Number, nouveauStock: Number, raison: String
}));

const Inventory = mongoose.model('Inventory', new mongoose.Schema({
    date: { type: String, default: () => new Date().toLocaleString('fr-FR') }, ecarts: Array
}));

const Expense = mongoose.model('Expense', new mongoose.Schema({
    date: { type: String, default: () => new Date().toLocaleString('fr-FR') },
    timestamp: { type: Number, default: () => Date.now() },
    categoriePrincipale: String, 
    sousCategorie: String,       
    beneficiaire: String,        
    description: String,         
    montantTotal: Number,        
    montantPaye: Number,         
    resteAPayer: { type: Number, default: 0 }, 
    statut: { type: String, default: 'paye' }, 
    modePaiement: String
}));

const Order = mongoose.model('Order', new mongoose.Schema({
    id: String, // 🔥 SÉCURITÉ: Passé en String pour compatibilité Konnect
    numero: String, date: String, timestamp: Number, articles: Array,
    numeroTable: String, statut: { type: String, default: 'en_attente' }, 
    total: Number, clientId: String, clientName: String,
    methodePaiement: { type: String, default: 'sur_place' }
}));

const TableCode = mongoose.model('TableCode', new mongoose.Schema({
    numero: Number, code: String, lastUpdated: Number
}));

const LoyalCustomer = mongoose.model('LoyalCustomer', new mongoose.Schema({
    nom: String, prenom: String, telephone: String,
    codeFidelite: { type: String, unique: true },
    dateInscription: { type: String, default: () => new Date().toLocaleDateString('fr-FR') },
    solde: { type: Number, default: 0 },
    points: { type: Number, default: 0 }, // L'argent disponible pour payer sur sa carte
    totalDepense: { type: Number, default: 0 } // La somme de tous ses achats historiques pour le calcul du bonus
}));
const StoreSettings = mongoose.model('StoreSettings', new mongoose.Schema({
    type: { type: String, unique: true }, // Ex: 'fidelite'
    pointsRequis: { type: Number, default: 100 }, // 🔥 CORRIGÉ
    valeurCredit: { type: Number, default: 5 }    // 🔥 CORRIGÉ
}));

const Sale = mongoose.model('Sale', new mongoose.Schema({
    id: String, numero: String,
    date: { type: String, default: () => new Date().toLocaleString('fr-FR') },
    timestamp: { type: Number, default: () => Date.now() },
    total: Number, remise: Number,
    typePaiement: String, 
    methodePaiement: { type: String, default: 'especes' },
    tableOrigine: String, articles: Array
}));

const CashRegister = mongoose.model('CashRegister', new mongoose.Schema({
    dateOuverture: { type: String, default: () => new Date().toLocaleString('fr-FR') },
    dateFermeture: String,
    timestampOuverture: { type: Number, default: () => Date.now() },
    fondDeCaisse: Number,
    totalVentesEspeces: { type: Number, default: 0 },
    especesReelles: Number,
    ecart: Number,
    statut: { type: String, default: 'ouvert' } 
}));

const OpenTicket = mongoose.model('OpenTicket', new mongoose.Schema({
    tableNum: String,
    ticketData: Object,
    lastUpdated: { type: Number, default: () => Date.now() }
}));

// ========== 3. MIDDLEWARES ET SÉCURITÉ ==========
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function verifierToken(req, res, next) {
    const tokenFourni = req.headers['authorization'];
    if (tokenFourni === CAISSE_TOKEN) {
        next();
    } else {
        res.status(403).json({ error: "Accès refusé. Token invalide ou manquant." });
    }
}

// =========================================================
// ========== 4. ROUTES API PUBLIQUES ==================
// =========================================================

app.post('/api/caisse/verify', (req, res) => {
    if (req.body.token === CAISSE_TOKEN) { res.json({ success: true, message: "Token accepté" }); } 
    else { res.status(401).json({ success: false, message: "Token invalide" }); }
});

app.get('/api/stock', async (req, res) => {
    try { res.json(await Product.find({ actif: { $ne: false } }).sort({ id: 1 })); } catch (err) { res.status(500).json(err); }
});

// 🔥 ROUTE COMMANDE (SÉCURISÉE)
// 🔥 ROUTE COMMANDE (SÉCURISÉE AVEC VÉRIFICATION DU CODE TABLE)
app.post('/api/commandes', async (req, res) => {
    try {
        const codeEnvoye = String(req.body.codeAuth);
        
        // 1. VÉRIFICATION DU CODE TABLE OU FIDÉLITÉ
        if (req.body.numeroTable && req.body.numeroTable !== 'Emporter') {
            let authValid = false;
            const fidele = await LoyalCustomer.findOne({ codeFidelite: codeEnvoye });
            if (fidele) authValid = true;

            if (!authValid) {
                const tableDb = await TableCode.findOne({ numero: parseInt(req.body.numeroTable) });
                if (tableDb && tableDb.code === codeEnvoye) authValid = true;
            }

            if (codeEnvoye === "00000") authValid = true;

            if (!authValid) {
                return res.status(403).json({ error: "Ce QR Code a expiré ou est invalide." });
            }
        }

        // 2. RECALCUL DU TOTAL SÉCURISÉ
        let totalSecurise = 0;
        let articlesSecurises = [];
        for (let art of req.body.articles) {
            const produitDb = await Product.findOne({ id: art.id });
            if (produitDb) {
                totalSecurise += (produitDb.prix * art.quantite);
                articlesSecurises.push({ ...art, prix: produitDb.prix });
            } else {
                totalSecurise += (art.prix * art.quantite);
                articlesSecurises.push(art);
            }
        }
        totalSecurise = parseFloat(totalSecurise.toFixed(2)); // 🔥 Fix précision

        // 3. GESTION DU PAIEMENT & GAIN DE POINTS FIDÉLITÉ
        let messageBonus = null;
        const cmdId = Date.now().toString();
        const numeroCmd = 'CMD' + Math.floor(Math.random() * 10000);

        // CAS A : Le client paie AVEC sa carte de fidélité (Wallet)
        if (req.body.methodePaiement === 'carte_fidelite') {
            const clientVIP = await LoyalCustomer.findOne({ codeFidelite: codeEnvoye });
            
            if (!clientVIP) {
                return res.status(403).json({ error: "Carte de fidélité non reconnue." });
            }
            if (clientVIP.solde < totalSecurise) {
                return res.status(400).json({ error: `Solde insuffisant (${clientVIP.solde.toFixed(2)} DT).` });
            }

            // Déduction de l'argent du Wallet
            clientVIP.solde = parseFloat((clientVIP.solde - totalSecurise).toFixed(2));
            // Statistiques globales
            clientVIP.totalDepense = parseFloat(((clientVIP.totalDepense || 0) + totalSecurise).toFixed(2));
            
            // 🔥 NOUVEAU : GAIN DE POINTS (1 DT = 1 Point)
            clientVIP.points = parseFloat(((clientVIP.points || 0) + totalSecurise).toFixed(2));
            messageBonus = `✨ Vous avez gagné ${totalSecurise.toFixed(2)} points fidélité !`;

            await clientVIP.save();

            // Trace de la vente
            await new Sale({
                id: cmdId,
                numero: numeroCmd,
                total: totalSecurise,
                remise: 0,
                typePaiement: 'complet',
                methodePaiement: 'Carte Fidélité',
                tableOrigine: `Fidèle : ${clientVIP.prenom} ${clientVIP.nom}`,
                articles: articlesSecurises,
                date: new Date().toLocaleString('fr-FR'),
                timestamp: Date.now()
            }).save();
        } 
        // CAS B : Le client paie autrement (Espèces/Ligne), mais il A SCANNÉ sa carte VIP
        else if (codeEnvoye && codeEnvoye !== "00000") {
            const clientVIP = await LoyalCustomer.findOne({ codeFidelite: codeEnvoye });
            if (clientVIP) {
                // Statistiques globales
                clientVIP.totalDepense = parseFloat(((clientVIP.totalDepense || 0) + totalSecurise).toFixed(2));
                
                // 🔥 NOUVEAU : GAIN DE POINTS
                clientVIP.points = parseFloat(((clientVIP.points || 0) + totalSecurise).toFixed(2));
                messageBonus = `✨ Vous avez gagné ${totalSecurise.toFixed(2)} points fidélité avec cette commande !`;
                
                await clientVIP.save();
            }
        }

        // 4. CRÉATION DE LA COMMANDE
        const isEnLigne = req.body.methodePaiement === 'en_ligne';
        const cmd = new Order({ 
            ...req.body, 
            articles: articlesSecurises,
            id: cmdId, 
            numero: numeroCmd, 
            date: new Date().toLocaleString('fr-FR'), 
            timestamp: Date.now(),
            total: totalSecurise,
            statut: isEnLigne ? 'attente_paiement' : 'en_attente' 
        });
        await cmd.save();

        if (isEnLigne) {
            const simulateurUrl = `/api/simulateur-paiement/${cmdId}`;
            return res.status(201).json({ ...cmd._doc, payUrl: simulateurUrl, bonusInfo: messageBonus });
        }

        io.emit('nouvelle_commande', cmd);
        res.status(201).json({ ...cmd._doc, bonusInfo: messageBonus });

    } catch (err) { 
        console.error("Erreur commande :", err);
        res.status(500).json({ error: err.message }); 
    }
});
// 🔥 API : CONVERTIR LES POINTS EN SOLDE VIP
// 🔥 API : CONVERTIR LES POINTS EN SOLDE VIP
app.post('/api/customers/convertir-points', verifierToken, async (req, res) => {
    try {
        const { codeFidelite } = req.body;
        const client = await LoyalCustomer.findOne({ codeFidelite });
        if (!client) return res.status(404).json({ error: "Client introuvable" });

        // On récupère les réglages avec une sécurité si c'est vide
        let configFid = await StoreSettings.findOne({ type: 'fidelite' });
        const pRequis = (configFid && configFid.pointsRequis) ? configFid.pointsRequis : 100;
        const vCredit = (configFid && configFid.valeurCredit) ? configFid.valeurCredit : 5;
        
        if (client.points < pRequis) {
            return res.status(400).json({ error: `Pas assez de points. Il faut ${pRequis} points.` });
        }

        // Calcul mathématique sécurisé
        const nbConversions = Math.floor(client.points / pRequis);
        const pointsAConsommer = nbConversions * pRequis;
        const argentGagne = nbConversions * vCredit;

        // Mise à jour propre avec toFixed pour éviter les erreurs de virgules
        client.points = parseFloat((client.points - pointsAConsommer).toFixed(2));
        client.solde = parseFloat((client.solde + argentGagne).toFixed(2));
        await client.save();

        res.json({  
            success: true, 
            message: `${pointsAConsommer} points convertis en ${argentGagne} DT !`, 
            solde: client.solde, 
            pointsRestants: client.points 
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});
// 🔥 API : RÉCUPÉRER LES COMMANDES EN COURS D'UN CLIENT PRÉCIS
app.get('/api/mes-commandes/:clientId', async (req, res) => {
    try {
        const clientId = req.params.clientId;
        // On cherche les commandes de ce client qui ne sont pas encore payées
        const commandes = await Order.find({ 
            clientId: clientId, 
            statut: { $ne: 'paye' } 
        });
        
        // On ne renvoie que l'essentiel (id et statut) pour des raisons de performance et sécurité
        const statuts = commandes.map(c => ({ id: c.id, statut: c.statut }));
        res.json(statuts);
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});
// 🔥 ROUTE : IDENTIFIER UN CLIENT VIA SON CODE QR (Public)
app.get('/api/fidelite/identifier/:code', async (req, res) => {
    try {
        const client = await LoyalCustomer.findOne({ codeFidelite: req.params.code });
        if (client) {
            res.json({ success: true, nomComplet: `${client.prenom} ${client.nom}` });
        } else {
            res.status(404).json({ success: false, message: "Client non reconnu" });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// =========================================================
// 🚀 SIMULATEUR LOCAL DE PAIEMENT (SÉCURISÉ)
// =========================================================
app.get('/api/simulateur-paiement/:orderId', async (req, res) => {
    try {
        const orderId = req.params.orderId;
        const commande = await Order.findOne({ id: orderId });
        
        if (!commande || commande.statut !== 'attente_paiement') {
            return res.send("<h2 style='text-align:center; font-family:sans-serif; margin-top:50px;'>Commande introuvable ou déjà payée. <br><a href='/'>Retour</a></h2>");
        }

        commande.statut = 'en_attente';
        await commande.save();

        // 🔥 SÉCURITÉ : Gestion atomique du stock avec $inc
        for (let art of commande.articles) {
            const produitMisAJour = await Product.findOneAndUpdate(
                { id: art.id, stock: { $exists: true } }, 
                { $inc: { stock: -art.quantite } },
                { new: true } // Renvoie la valeur APRÈS déduction
            );

            if (produitMisAJour) {
                await new Movement({ 
                    type: 'vente_web', produit: produitMisAJour.nom, produitId: produitMisAJour.id, 
                    quantite: art.quantite, 
                    ancienStock: produitMisAJour.stock + art.quantite, // Reconstitution mathématique
                    nouveauStock: produitMisAJour.stock, 
                    raison: `Commande WEB #${commande.numero}` 
                }).save();
            }
        }

        const vente = new Sale({
            id: Date.now().toString(),
            numero: commande.numero,
            total: commande.total, // Utilise le total déjà sécurisé de la commande
            remise: 0,
            typePaiement: 'complet',
            methodePaiement: 'en_ligne',
            tableOrigine: commande.clientName ? `Fidèle: ${commande.clientName}` : `WEB - ${commande.numeroTable}`,
            articles: commande.articles
        });
        await vente.save();

        io.emit('nouvelle_commande', commande);
        io.emit('update_stock');

        res.send(`
            <div style="text-align:center; padding: 50px; font-family: 'Inter', sans-serif;">
                <i class="fas fa-check-circle" style="font-size: 80px; color: #27ae60; margin-bottom: 20px;"></i>
                <h1 style="color: #2c3e50;">Paiement Simulé Réussi !</h1>
                <p style="color: #7f8c8d; font-size: 1.2rem;">Votre commande <b>#${commande.numero}</b> a été envoyée en cuisine.</p>
                <a href="/" style="display:inline-block; margin-top: 30px; padding: 15px 30px; background: #db800a; color: white; text-decoration: none; border-radius: 12px; font-weight: bold; font-size: 1.1rem;">
                    Retour au Menu
                </a>
            </div>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
        `);

    } catch (err) { res.status(500).send("Erreur de simulation : " + err.message); }
});

// =========================================================
// 🔥 WEBHOOK KONNECT (SÉCURISÉ)
// =========================================================
app.post('/api/webhook/paiement', async (req, res) => {
    const paymentId = req.query.payment_ref;
    if (!paymentId) return res.status(400).send("Payment_ref manquant");

    try {
        const checkRes = await axios.get(`https://api.preprod.konnect.network/api/v2/payments/${paymentId}`, {
            headers: { 'x-api-key': process.env.KONNECT_API_KEY }
        });

        const paymentData = checkRes.data.payment;

        if (paymentData.status === 'completed') {
            const orderId = paymentData.orderId.toString(); // S'assure que c'est une string
            
            const commande = await Order.findOne({ id: orderId });
            if (!commande || commande.statut !== 'attente_paiement') {
                return res.status(200).send("Commande déjà traitée");
            }

            commande.statut = 'en_attente';
            await commande.save();

            // 🔥 SÉCURITÉ : Gestion atomique du stock avec $inc
            for (let art of commande.articles) {
                const produitMisAJour = await Product.findOneAndUpdate(
                    { id: art.id, stock: { $exists: true } }, 
                    { $inc: { stock: -art.quantite } },
                    { new: true } 
                );

                if (produitMisAJour) {
                    await new Movement({ 
                        type: 'vente_web', produit: produitMisAJour.nom, produitId: produitMisAJour.id, 
                        quantite: art.quantite, ancienStock: produitMisAJour.stock + art.quantite,
                        nouveauStock: produitMisAJour.stock, raison: `Commande WEB #${commande.numero}` 
                    }).save();
                }
            }

            const vente = new Sale({
                id: Date.now().toString(),
                numero: commande.numero,
                total: commande.total, // Utilise le total sécurisé
                remise: 0,
                typePaiement: 'complet',
                methodePaiement: 'en_ligne', 
                tableOrigine: commande.clientName ? `Fidèle: ${commande.clientName}` : `WEB - ${commande.numeroTable}`,
                articles: commande.articles
            });
            await vente.save();

            io.emit('nouvelle_commande', commande); 
            io.emit('update_stock'); 

            return res.status(200).send("Webhook traité avec succès");
        } else {
            return res.status(200).send("Le paiement n'est pas encore validé");
        }
    } catch (err) {
        console.error("❌ Erreur Webhook:", err.message);
        return res.status(500).send("Erreur interne du serveur");
    }
});

app.get('/api/numbers', async (req, res) => {
    try { res.json(await TableCode.find({}).sort({ numero: 1 })); } 
    catch (err) { res.status(500).json(err); }
});

// =========================================================
// ========== 5. ROUTES API SÉCURISÉES =================
// =========================================================

app.get('/api/tickets-ouverts', verifierToken, async (req, res) => {
    try { res.json(await OpenTicket.find({})); } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/tickets-ouverts', verifierToken, async (req, res) => {
    try {
        await OpenTicket.findOneAndUpdate(
            { tableNum: req.body.tableNum },
            { ticketData: req.body.ticketData, lastUpdated: Date.now() },
            { upsert: true, new: true }
        );
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/customers', verifierToken, async (req, res) => {
    try { res.json(await LoyalCustomer.find({}).sort({ _id: -1 })); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/customers', verifierToken, async (req, res) => {
    try {
        const nouveau = new LoyalCustomer(req.body);
        await nouveau.save(); 
        res.json({ success: true, customer: nouveau });
    } catch (err) { res.status(500).json({ error: "Erreur serveur" }); }
});

app.delete('/api/customers/:id', verifierToken, async (req, res) => {
    try {
        await LoyalCustomer.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/customers/verify/:code', async (req, res) => {
    try {
        const customer = await LoyalCustomer.findOne({ codeFidelite: req.params.code });
        if (customer) res.json({ success: true, customer });
        else res.status(404).json({ success: false });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/commandes', verifierToken, async (req, res) => {
    try { res.json(await Order.find({ statut: { $ne: 'paye' } })); } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/commandes/:id/statut', verifierToken, async (req, res) => {
    try {
        const cmd = await Order.findOneAndUpdate({ id: req.params.id }, { statut: req.body.statut }, { new: true });
        io.emit('mise_a_jour_commande', cmd);
        res.json(cmd);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/commandes/table/:numeroTable/paye', verifierToken, async (req, res) => {
    try {
        const numeroTable = req.params.numeroTable;
        const commandes = await Order.find({ numeroTable: numeroTable, statut: { $ne: 'paye' } });
        for (let cmd of commandes) {
            cmd.statut = 'paye';
            await cmd.save();
            io.emit('mise_a_jour_commande', cmd);
        }
        res.json({ success: true, effacees: commandes.length });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/tiroir/statut', verifierToken, async (req, res) => {
    try {
        const session = await CashRegister.findOne({ statut: 'ouvert' });
        res.json({ ouvert: !!session, session });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/tiroir/ouvrir', verifierToken, async (req, res) => {
    try {
        const dejaOuvert = await CashRegister.findOne({ statut: 'ouvert' });
        if (dejaOuvert) return res.status(400).json({ error: "Une session de caisse est déjà ouverte." });

        const session = new CashRegister({ fondDeCaisse: req.body.fond });
        await session.save();
        res.json({ success: true, session });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 🔥 API : CLÔTURER LA CAISSE (Rapport Z Complet)
app.post('/api/tiroir/fermer', verifierToken, async (req, res) => {
    try {
        const { reel } = req.body;
        const session = await SessionCaisse.findOne({ statut: 'ouverte' });
        
        if (!session) {
            return res.status(400).json({ error: "Aucune caisse ouverte actuellement." });
        }

        // 1. Récupérer TOUTES les ventes réalisées depuis l'ouverture de cette caisse
        // (On suppose que v.timestamp est en millisecondes. Si tu utilises une date ISO, adapte la requête)
        const ventesSession = await Vente.find({
            timestamp: { $gte: session.dateOuverture.getTime() }
        });

        // 2. Calculer le vrai Chiffre d'Affaires et la répartition des paiements
        let totalCA = 0;
        let totalEspeces = 0;
        let totalCarte = 0;
        let totalEnLigne = 0;
        let totalFidelite = 0;
        let totalTicketResto = 0;

        ventesSession.forEach(v => {
            const montant = parseFloat(v.total) || 0;
            totalCA += montant;
            
            if (v.methodePaiement === 'especes') totalEspeces += montant;
            else if (v.methodePaiement === 'carte') totalCarte += montant;
            else if (v.methodePaiement === 'en_ligne') totalEnLigne += montant;
            else if (v.methodePaiement === 'carte_fidelite') totalFidelite += montant;
            else if (v.methodePaiement === 'ticket_resto') totalTicketResto += montant;
            else totalEspeces += montant; // Fallback par défaut
        });

        // 3. Calculer l'écart dans le tiroir physique
        // L'argent attendu = Le fond de caisse initial + Les ventes en espèces (uniquement)
        const attendu = session.fondDeCaisse + totalEspeces; 
        const ecart = parseFloat(reel) - attendu;

        // 4. Mettre à jour et fermer la session
        session.statut = 'fermee';
        session.dateFermeture = new Date();
        session.totalVentesEspeces = totalEspeces;
        session.especesReelles = parseFloat(reel);
        session.ecart = ecart;
        session.caTotalSession = totalCA; // On sauvegarde le CA total généré
        await session.save();

        // 5. Renvoyer le rapport détaillé à la caisse
        res.json({
            success: true,
            attendu: attendu,
            session: session,
            rapportZ: {
                totalCA: totalCA,
                nbTickets: ventesSession.length,
                details: {
                    especes: totalEspeces,
                    carte: totalCarte,
                    en_ligne: totalEnLigne,
                    fidelite: totalFidelite,
                    ticket_resto: totalTicketResto
                }
            }
        });
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

app.post('/api/stock', verifierToken, async (req, res) => {
    try {
        const nouveau = new Product({ ...req.body, id: Date.now() });
        await nouveau.save();
        io.emit('update_stock'); 
        res.json({ success: true, produit: nouveau });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/stock/:id', verifierToken, async (req, res) => {
    try {
        const misAJour = await Product.findOneAndUpdate({ id: req.params.id }, req.body, { new: true });
        io.emit('update_stock'); 
        res.json({ success: true, produit: misAJour });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/stock/:id', verifierToken, async (req, res) => {
    try {
        await Product.findOneAndUpdate({ id: req.params.id }, { actif: false });
        io.emit('update_stock'); 
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/stock/:id/add', verifierToken, async (req, res) => {
    try {
        const p = await Product.findOne({ id: req.params.id });
        if (p) {
            const ancien = p.stock;
            p.stock += parseInt(req.body.quantite);
            await p.save();
            await new Movement({ type: 'ajout', produit: p.nom, produitId: p.id, quantite: req.body.quantite, ancienStock: ancien, nouveauStock: p.stock, raison: req.body.raison || 'Réception' }).save();
            io.emit('update_stock'); 
            res.json({ success: true });
        } else { res.status(404).json({ error: "Produit introuvable" }); }
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 🔥 DÉCRÉMENTATION STOCK DEPUIS LA CAISSE (SÉCURISÉE AVEC $INC)
app.post('/api/stock/decrementer', verifierToken, async (req, res) => {
    try {
        for (let art of req.body.articles) {
            const p = await Product.findOneAndUpdate(
                { id: art.id, stock: { $exists: true } }, 
                { $inc: { stock: -art.quantite } }, 
                { new: true }
            );
            if (p) {
                await new Movement({ 
                    type: 'vente', produit: p.nom, produitId: art.id, 
                    quantite: art.quantite, nouveauStock: p.stock, 
                    ancienStock: p.stock + art.quantite, raison: "Vente" 
                }).save();
            }
        }
        io.emit('update_stock');
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/stock/historique', verifierToken, async (req, res) => {
    try { res.json(await Movement.find({}).sort({ _id: -1 }).limit(100)); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/stock/inventaires', verifierToken, async (req, res) => {
    try { res.json(await Inventory.find({}).sort({ _id: -1 })); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/stock/inventaire', verifierToken, async (req, res) => {
    try {
        const { produits } = req.body;
        const ecarts = [];
        for (let p of produits) {
            const dbP = await Product.findOne({ id: p.id });
            if (dbP) {
                const ancien = dbP.stock;
                dbP.stock = p.stockPhysique;
                await dbP.save();
                ecarts.push({ produit: dbP.nom, ancien, nouveau: p.stockPhysique, ecart: p.stockPhysique - ancien });
            }
        }
        await new Inventory({ ecarts }).save();
        io.emit('update_stock'); 
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/depenses', verifierToken, async (req, res) => {
    try { res.json(await Expense.find({}).sort({ _id: -1 })); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/depenses', verifierToken, async (req, res) => { 
    try {
        await new Expense(req.body).save(); 
        res.json({ success: true }); 
    } catch (err) { res.status(500).json({ error: err.message }); }
});
app.delete('/api/depenses/:id', verifierToken, async (req, res) => {
    try {
        await Expense.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: "Opération supprimée" });
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});
app.put('/api/depenses/:id', verifierToken, async (req, res) => {
    try {
        const misAJour = await Expense.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json({ success: true, depense: misAJour });
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});
// 🔥 API : LIRE LES PARAMÈTRES DE FIDÉLITÉ
// 🔥 CORRECTION : On enlève 'verifierToken' pour que le client puisse lire la config
app.get('/api/settings/fidelite', async (req, res) => {
    try {
        let config = await StoreSettings.findOne({ type: 'fidelite' });
        if (!config) config = await new StoreSettings({ type: 'fidelite', pointsRequis: 100, valeurCredit: 5 }).save();
        res.json(config);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 🔥 API : SAUVEGARDER LES PARAMÈTRES DE FIDÉLITÉ
app.post('/api/settings/fidelite', verifierToken, async (req, res) => {
    try {
        // On récupère bien les nouvelles variables envoyées par le frontend
        const { pointsRequis, valeurCredit } = req.body;
        const config = await StoreSettings.findOneAndUpdate(
            { type: 'fidelite' },
            { pointsRequis, valeurCredit },
            { new: true, upsert: true }
        );
        res.json({ success: true, config });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/numbers/refresh/:numero', async (req, res) => {
    try {
        const updated = await TableCode.findOneAndUpdate(
            { numero: req.params.numero }, 
            { code: Math.floor(Math.random()*90000+10000).toString(), lastUpdated: Date.now() }, 
            { upsert: true, new: true }
        );
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/ventes', verifierToken, async (req, res) => {
    try {
        res.json(await Sale.find({}).sort({ timestamp: -1 }));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 🔥 VENTES CAISSE (SÉCURISÉES)
app.post('/api/ventes', verifierToken, async (req, res) => {
    try {
        if (req.body.id) {
            const venteExistante = await Sale.findOne({ id: req.body.id.toString() });
            if (venteExistante) {
                return res.json({ success: true, message: "Vente déjà synchronisée (Ignoré)" });
            }
        }

        let vraiTotalReel = 0;
        const articlesVendus = req.body.articles;

        for (let art of articlesVendus) {
            const produitDb = await Product.findOne({ $or: [{ id: art.id }, { nom: art.nom }] });
            
            if (produitDb) {
                vraiTotalReel += (produitDb.prix * art.quantite); // Utilise le vrai prix DB
                
                // 🔥 SÉCURITÉ : Gestion atomique du stock avec $inc
                if (produitDb.stock !== undefined) {
                    const produitMisAJour = await Product.findOneAndUpdate(
                        { id: produitDb.id },
                        { $inc: { stock: -art.quantite } },
                        { new: true }
                    );

                    await new Movement({ 
                        type: 'vente', produit: produitMisAJour.nom, produitId: produitMisAJour.id, 
                        quantite: art.quantite, 
                        ancienStock: produitMisAJour.stock + art.quantite,
                        nouveauStock: produitMisAJour.stock, 
                        raison: `Vente ${req.body.numero}` 
                    }).save();
                }
            } else {
                vraiTotalReel += (art.prix * art.quantite); 
            }
        }

        if (req.body.remise && req.body.remise > 0) {
            vraiTotalReel = vraiTotalReel * (1 - (req.body.remise / 100));
        }

        const venteData = { ...req.body, total: vraiTotalReel };
        const vente = new Sale(venteData);
        await vente.save();
        
        io.emit('update_stock');
        
        res.json({ success: true, totalSecurise: vraiTotalReel });
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});
app.put('/api/commandes/partiel-ids', verifierToken, async (req, res) => {
    try {
        const { orderIds, articlesRestants } = req.body;
        if (!orderIds || orderIds.length === 0) return res.json({ success: true });

        // On cherche toutes les commandes actives liées à ce ticket
        const commandes = await Order.find({ id: { $in: orderIds }, statut: { $ne: 'paye' } });
        if (commandes.length === 0) return res.json({ success: true });

        if (articlesRestants.length === 0) {
            // S'il ne reste plus d'articles, on clôture tout en cuisine
            for (let cmd of commandes) {
                cmd.statut = 'paye';
                await cmd.save();
                io.emit('mise_a_jour_commande', cmd);
            }
        } else {
            // S'il reste des articles, on met à jour la première commande avec le reste
            const cmdPrincipale = commandes[0];
            cmdPrincipale.articles = articlesRestants;
            cmdPrincipale.total = articlesRestants.reduce((s, a) => s + (a.prix * a.quantite), 0);
            await cmdPrincipale.save();
            io.emit('mise_a_jour_commande', cmdPrincipale);

            // On clôture les autres commandes fusionnées pour nettoyer l'écran de la cuisine
            for (let i = 1; i < commandes.length; i++) {
                commandes[i].statut = 'paye';
                await commandes[i].save();
                io.emit('mise_a_jour_commande', commandes[i]);
            }
        }
        res.json({ success: true });
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});
// 🔥 API : RECHARGER LA CARTE FIDÉLITÉ (Caissier)
app.post('/api/customers/recharge', verifierToken, async (req, res) => {
    try {
        const { codeFidelite, montant } = req.body;
        const client = await LoyalCustomer.findOne({ codeFidelite });
        if (!client) return res.status(404).json({ error: "Client introuvable" });

        client.solde += parseFloat(montant); // On ajoute l'argent
        await client.save();
        
        res.json({ success: true, solde: client.solde });
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

// ========== 6. INITIALISATION DU MENU (SEED) ==========
async function seedDatabase() {
    try {
        const count = await Product.countDocuments();
        if (count === 0) {
            await Product.insertMany([
                { id: 1, nom: "Espresso", stock: 200, prixAchat: 0.8, prix: 2.5, unite: "tasse", categorie: "cafe", seuilAlerte: 20 }
            ]);
            console.log("✅ Menu initial injecté dans MongoDB !");
        }
    } catch (err) { console.error("Erreur de Seed:", err); }
}

// ========== 7. DÉMARRAGE DU SERVEUR ==========
mongoose.connection.once('open', () => {
    server.listen(PORT, () => {
        console.log(`🚀 TA'BIA Coffee Shop Online !`);
        console.log(`📍 Port : ${PORT}`);
        seedDatabase();
    });
});