require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');

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

mongoose.connect(mongoURI)
    .then(() => console.log("🚀 TA'BIA DB : Connectée avec succès !"))
    .catch(err => { 
        console.error("❌ Erreur critique de connexion DB:", err); 
        process.exit(1); 
    });

// ========== 2. MODÈLES DE DONNÉES (SCHÉMAS) ==========

const Product = mongoose.model('Product', new mongoose.Schema({
    id: Number, nom: String, prix: Number, stock: Number, categorie: String, 
    image: { type: String, default: 'https://via.placeholder.com/150' },
    variantes: { type: String, default: "" }, 
    typeChoix: { type: String, default: "unique" },
    seuilAlerte: { type: Number, default: 10 }, unite: String,
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

// 🔥 MODÈLE DÉPENSES "PRO" (Avec gestion RH et Dettes Fournisseurs)
const Expense = mongoose.model('Expense', new mongoose.Schema({
    date: { type: String, default: () => new Date().toLocaleString('fr-FR') },
    timestamp: { type: Number, default: () => Date.now() },
    categoriePrincipale: String, // 'rh', 'fournisseur', 'fixes', 'autre'
    sousCategorie: String,       // 'avance', 'salaire', 'steg', 'boissons'...
    beneficiaire: String,        // Nom de l'employé ou du fournisseur
    description: String,         // Motif (ex: Facture #123)
    montantTotal: Number,        // Montant total de la facture ou du salaire
    montantPaye: Number,         // Combien on a sorti de la caisse aujourd'hui
    resteAPayer: { type: Number, default: 0 }, // La dette (Le fameux "Kridi")
    statut: { type: String, default: 'paye' }, // 'paye' ou 'credit'
    modePaiement: String
}));

const Order = mongoose.model('Order', new mongoose.Schema({
    id: Number, numero: String, date: String, timestamp: Number, articles: Array,
    numeroTable: String, statut: { type: String, default: 'en_attente' }, 
    total: Number, clientId: String, clientName: String 
}));

const TableCode = mongoose.model('TableCode', new mongoose.Schema({
    numero: Number, code: String, lastUpdated: Number
}));

const LoyalCustomer = mongoose.model('LoyalCustomer', new mongoose.Schema({
    nom: String, prenom: String, telephone: String,
    codeFidelite: { type: String, unique: true },
    dateInscription: { type: String, default: () => new Date().toLocaleDateString('fr-FR') }
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

app.post('/api/commandes', async (req, res) => {
    try {
        const cmd = new Order({ 
            ...req.body, id: Date.now(), 
            numero: 'CMD'+Math.floor(Math.random()*10000), 
            date: new Date().toLocaleString('fr-FR'), 
            timestamp: Date.now() 
        });
        await cmd.save();
        io.emit('nouvelle_commande', cmd);
        res.status(201).json(cmd);
    } catch (err) { res.status(500).json({ error: err.message }); }
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

app.post('/api/tiroir/fermer', verifierToken, async (req, res) => {
    try {
        const session = await CashRegister.findOne({ statut: 'ouvert' });
        if (!session) return res.status(400).json({ error: "Aucune caisse ouverte" });

        const ventes = await Sale.find({ 
            timestamp: { $gte: session.timestampOuverture },
            methodePaiement: 'especes'
        });
        
        const totalEspeces = ventes.reduce((sum, v) => sum + v.total, 0);
        const attendu = session.fondDeCaisse + totalEspeces;
        const ecart = req.body.reel - attendu;

        session.dateFermeture = new Date().toLocaleString('fr-FR');
        session.totalVentesEspeces = totalEspeces;
        session.especesReelles = req.body.reel;
        session.ecart = ecart;
        session.statut = 'ferme';
        await session.save();

        res.json({ success: true, session, attendu });
    } catch (err) { res.status(500).json({ error: err.message }); }
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

app.post('/api/stock/decrementer', verifierToken, async (req, res) => {
    try {
        for (let art of req.body.articles) {
            const p = await Product.findOneAndUpdate({ id: art.id }, { $inc: { stock: -art.quantite } }, { new: true });
            if (p) {
                await new Movement({ type: 'vente', produit: p.nom, produitId: art.id, quantite: art.quantite, nouveauStock: p.stock, raison: "Vente" }).save();
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

// 🔥 LA ROUTE MANQUANTE POUR AFFICHER LES VENTES DANS LES RAPPORTS !
app.get('/api/ventes', verifierToken, async (req, res) => {
    try {
        res.json(await Sale.find({}).sort({ timestamp: -1 }));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/ventes', verifierToken, async (req, res) => {
    try {
        let vraiTotalReel = 0;
        const articlesVendus = req.body.articles;

        for (let art of articlesVendus) {
            const produitDb = await Product.findOne({ $or: [{ id: art.id }, { nom: art.nom }] });
            if (produitDb) vraiTotalReel += (produitDb.prix * art.quantite);
            else vraiTotalReel += (art.prix * art.quantite); 
        }

        if (req.body.remise && req.body.remise > 0) {
            vraiTotalReel = vraiTotalReel * (1 - (req.body.remise / 100));
        }

        const venteData = { ...req.body, total: vraiTotalReel };
        const vente = new Sale(venteData);
        await vente.save();
        
        res.json({ success: true, totalSecurise: vraiTotalReel });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ========== 6. INITIALISATION DU MENU (SEED) ==========
async function seedDatabase() {
    try {
        const count = await Product.countDocuments();
        if (count === 0) {
            await Product.insertMany([
                { id: 1, nom: "Espresso", stock: 200, prix: 2.5, unite: "tasse", categorie: "cafe", seuilAlerte: 20 }
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