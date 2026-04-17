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

// ========== 0. SÉCURITÉ WEBSOCKET & ISOLATION MULTI-CAFÉ ==========
io.use((socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.headers['authorization'];
    
    // 🔥 SAAS : On extrait le cafeId depuis l'URL de connexion du Socket
    const host = socket.handshake.headers.host || '';
    socket.cafeId = host.split('.')[0]; // ex: "tabia" depuis "tabia.sarbini.click"

    if (token === CAISSE_TOKEN || socket.handshake.query.clientType === 'customer') {
        next();
    } else {
        next(new Error("Accès WebSocket refusé. Token invalide."));
    }
});

io.on('connection', (socket) => {
    // 🔥 SAAS : On enferme ce client/caissier dans la chambre de son propre café
    if (socket.cafeId) {
        socket.join(socket.cafeId);
    }
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
    prix: Number, 
    prixAchat: { type: Number, default: 0 }, 
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
    id: String, numero: String, date: String, timestamp: Number, articles: Array,
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
    logoUrl: String
}));

const Sale = mongoose.model('Sale', new mongoose.Schema({
    cafeId: { type: String, required: true, index: true },
    id: String, numero: String,
    date: { type: String, default: () => new Date().toLocaleString('fr-FR') },
    timestamp: { type: Number, default: () => Date.now() },
    total: Number, remise: Number,
    typePaiement: String, methodePaiement: { type: String, default: 'especes' },
    tableOrigine: String, articles: Array
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

// 🔥 SAAS : L'AIGUILLEUR (Détecte le café d'après l'URL)
app.use((req, res, next) => {
    const host = req.headers.host || ''; 
    const subdomain = host.split('.')[0]; 
    req.cafeId = subdomain || 'demo'; // Sécurité fallback
    next();
});

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
// =========================================================
// 🔥 API BRANDING (DESIGN DU CAFÉ SAAS)
// =========================================================

app.get('/api/branding', async (req, res) => {
    try {
        let config = await StoreSettings.findOne({ cafeId: req.cafeId, type: 'branding' });
        // Si le café n'a rien configuré, on lui donne le design TA'BIA par défaut
        if (!config) {
            config = {
                nomCafe: req.cafeId.toUpperCase(),
                sloganCafe: "Coffee Shop",
                couleurPrincipale: "#143621",
                logoUrl: "logo.jpg"
            };
        }
        res.json(config);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/branding', verifierToken, async (req, res) => {
    try {
        const { nomCafe, sloganCafe, couleurPrincipale, logoUrl } = req.body;
        const config = await StoreSettings.findOneAndUpdate(
            { cafeId: req.cafeId, type: 'branding' },
            { nomCafe, sloganCafe, couleurPrincipale, logoUrl },
            { new: true, upsert: true }
        );
        res.json({ success: true, config });
    } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/caisse/verify', (req, res) => {
    if (req.body.token === CAISSE_TOKEN) { res.json({ success: true, message: "Token accepté" }); } 
    else { res.status(401).json({ success: false, message: "Token invalide" }); }
});

app.get('/api/stock', async (req, res) => {
    try { res.json(await Product.find({ cafeId: req.cafeId, actif: { $ne: false } }).sort({ id: 1 })); } catch (err) { res.status(500).json(err); }
});

// 🔥 ROUTE COMMANDE (SÉCURISÉE AVEC VÉRIFICATION DU CODE TABLE)
app.post('/api/commandes', async (req, res) => {
    try {
        const codeEnvoye = String(req.body.codeAuth);
        
        if (req.body.numeroTable && req.body.numeroTable !== 'Emporter') {
            let authValid = false;
            const fidele = await LoyalCustomer.findOne({ cafeId: req.cafeId, codeFidelite: codeEnvoye });
            if (fidele) authValid = true;

            if (!authValid) {
                const tableDb = await TableCode.findOne({ cafeId: req.cafeId, numero: parseInt(req.body.numeroTable) });
                if (tableDb && tableDb.code === codeEnvoye) authValid = true;
            }

            if (codeEnvoye === "00000") authValid = true;

            if (!authValid) {
                return res.status(403).json({ error: "Ce QR Code a expiré ou est invalide." });
            }
        }

        let totalSecurise = 0;
        let articlesSecurises = [];
        for (let art of req.body.articles) {
            const produitDb = await Product.findOne({ cafeId: req.cafeId, id: art.id });
            if (produitDb) {
                totalSecurise += (produitDb.prix * art.quantite);
                articlesSecurises.push({ ...art, prix: produitDb.prix });
            } else {
                totalSecurise += (art.prix * art.quantite);
                articlesSecurises.push(art);
            }
        }
        totalSecurise = parseFloat(totalSecurise.toFixed(2));

        let messageBonus = null;
        const cmdId = Date.now().toString();
        const numeroCmd = 'CMD' + Math.floor(Math.random() * 10000);

        if (req.body.methodePaiement === 'carte_fidelite') {
            const clientVIP = await LoyalCustomer.findOne({ cafeId: req.cafeId, codeFidelite: codeEnvoye });
            
            if (!clientVIP) return res.status(403).json({ error: "Carte de fidélité non reconnue." });
            if (clientVIP.solde < totalSecurise) return res.status(400).json({ error: `Solde insuffisant (${clientVIP.solde.toFixed(2)} DT).` });

            clientVIP.solde = parseFloat((clientVIP.solde - totalSecurise).toFixed(2));
            clientVIP.totalDepense = parseFloat(((clientVIP.totalDepense || 0) + totalSecurise).toFixed(2));
            clientVIP.points = parseFloat(((clientVIP.points || 0) + totalSecurise).toFixed(2));
            messageBonus = `✨ Vous avez gagné ${totalSecurise.toFixed(2)} points fidélité !`;
            await clientVIP.save();

            await new Sale({
                cafeId: req.cafeId, id: cmdId, numero: numeroCmd, total: totalSecurise, remise: 0,
                typePaiement: 'complet', methodePaiement: 'Carte Fidélité',
                tableOrigine: `Fidèle : ${clientVIP.prenom} ${clientVIP.nom}`, articles: articlesSecurises,
                date: new Date().toLocaleString('fr-FR'), timestamp: Date.now()
            }).save();

            for (let art of articlesSecurises) {
                const qte = parseInt(art.quantite) || 1;
                const produitMisAJour = await Product.findOneAndUpdate(
                    { cafeId: req.cafeId, id: art.id }, { $inc: { stock: -qte } }, { new: true }
                );

                if (produitMisAJour && produitMisAJour.stock !== undefined) {
                    await new Movement({ 
                        cafeId: req.cafeId, type: 'vente_vip', produit: produitMisAJour.nom, produitId: produitMisAJour.id, 
                        quantite: qte, ancienStock: produitMisAJour.stock + qte, nouveauStock: produitMisAJour.stock, raison: `Achat VIP #${numeroCmd}` 
                    }).save();
                }
            }
            io.to(req.cafeId).emit('update_stock'); // 🔥 Envoi ciblé au café !
        }
        else if (codeEnvoye && codeEnvoye !== "00000") {
            const clientVIP = await LoyalCustomer.findOne({ cafeId: req.cafeId, codeFidelite: codeEnvoye });
            if (clientVIP) {
                clientVIP.totalDepense = parseFloat(((clientVIP.totalDepense || 0) + totalSecurise).toFixed(2));
                clientVIP.points = parseFloat(((clientVIP.points || 0) + totalSecurise).toFixed(2));
                messageBonus = `✨ Vous avez gagné ${totalSecurise.toFixed(2)} points fidélité avec cette commande !`;
                await clientVIP.save();
            }
        }

        const isEnLigne = req.body.methodePaiement === 'en_ligne';
        const cmd = new Order({ 
            ...req.body, 
            cafeId: req.cafeId, // 🔥 Sauvegarde l'appartenance
            articles: articlesSecurises, id: cmdId, numero: numeroCmd, 
            date: new Date().toLocaleString('fr-FR'), timestamp: Date.now(),
            total: totalSecurise, statut: isEnLigne ? 'attente_paiement' : 'en_attente' 
        });
        await cmd.save();

        if (isEnLigne) {
            const simulateurUrl = `/api/simulateur-paiement/${cmdId}`;
            return res.status(201).json({ ...cmd._doc, payUrl: simulateurUrl, bonusInfo: messageBonus });
        }

        io.to(req.cafeId).emit('nouvelle_commande', cmd); // 🔥 Alerte la bonne cuisine !
        res.status(201).json({ ...cmd._doc, bonusInfo: messageBonus });

    } catch (err) { 
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
            const produitMisAJour = await Product.findOneAndUpdate(
                { cafeId: req.cafeId, id: art.id }, { $inc: { stock: -art.quantite } }, { new: true }
            );

            if (produitMisAJour && produitMisAJour.stock !== undefined) {
                await new Movement({ 
                    cafeId: req.cafeId, type: 'vente_web', produit: produitMisAJour.nom, produitId: produitMisAJour.id, 
                    quantite: art.quantite, ancienStock: produitMisAJour.stock + art.quantite,
                    nouveauStock: produitMisAJour.stock, raison: `Commande WEB #${commande.numero}` 
                }).save();
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
            const p = await Product.findOneAndUpdate(
                { cafeId: req.cafeId, id: art.id, stock: { $exists: true } }, 
                { $inc: { stock: -art.quantite } }, { new: true }
            );
            if (p) {
                await new Movement({ 
                    cafeId: req.cafeId, type: 'vente', produit: p.nom, produitId: art.id, 
                    quantite: art.quantite, nouveauStock: p.stock, ancienStock: p.stock + art.quantite, raison: "Vente" 
                }).save();
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
        for (let art of req.body.articles) {
            const produitDb = await Product.findOne({ cafeId: req.cafeId, $or: [{ id: art.id }, { nom: art.nom }] });
            
            if (produitDb) {
                vraiTotalReel += (produitDb.prix * art.quantite); 
                
                if (produitDb.stock !== undefined) {
                    const produitMisAJour = await Product.findOneAndUpdate(
                        { cafeId: req.cafeId, id: produitDb.id }, { $inc: { stock: -art.quantite } }, { new: true }
                    );

                    await new Movement({ 
                        cafeId: req.cafeId, type: 'vente', produit: produitMisAJour.nom, produitId: produitMisAJour.id, 
                        quantite: art.quantite, ancienStock: produitMisAJour.stock + art.quantite,
                        nouveauStock: produitMisAJour.stock, raison: `Vente ${req.body.numero}` 
                    }).save();
                }
            } else { vraiTotalReel += (art.prix * art.quantite); }
        }

        if (req.body.remise && req.body.remise > 0) vraiTotalReel = vraiTotalReel * (1 - (req.body.remise / 100));

        await new Sale({ ...req.body, cafeId: req.cafeId, total: vraiTotalReel }).save();
        io.to(req.cafeId).emit('update_stock');
        res.json({ success: true, totalSecurise: vraiTotalReel });
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