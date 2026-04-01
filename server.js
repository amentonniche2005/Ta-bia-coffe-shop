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
    seuilAlerte: { type: Number, default: 10 }, unite: String
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
    categorie: String, description: String, montant: Number, mode: String
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
    typePaiement: String, // complet ou partiel
    methodePaiement: { type: String, default: 'especes' }, // 🔥 NOUVEAU
    tableOrigine: String, articles: Array
}));

// 🔥 NOUVEAU : Modèle pour la journée de caisse (Z-Report)
const CashRegister = mongoose.model('CashRegister', new mongoose.Schema({
    dateOuverture: { type: String, default: () => new Date().toLocaleString('fr-FR') },
    dateFermeture: String,
    timestampOuverture: { type: Number, default: () => Date.now() },
    fondDeCaisse: Number,
    totalVentesEspeces: { type: Number, default: 0 },
    especesReelles: Number,
    ecart: Number,
    statut: { type: String, default: 'ouvert' } // 'ouvert' ou 'ferme'
}));

// ========== 3. MIDDLEWARES ET SÉCURITÉ ==========
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const CAISSE_TOKEN = process.env.CAISSE_TOKEN || '12345678';

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
    try { res.json(await Product.find({}).sort({ id: 1 })); } catch (err) { res.status(500).json(err); }
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

app.get('/api/customers', async (req, res) => {
    res.json(await LoyalCustomer.find({}).sort({ _id: -1 }));
});

app.post('/api/customers', async (req, res) => {
    try {
        const nouveau = new LoyalCustomer(req.body);
        await nouveau.save(); 
        res.json({ success: true, customer: nouveau });
    } catch (err) { 
        res.status(500).json({ error: "Erreur serveur" }); 
    }
});

app.delete('/api/customers/:id', async (req, res) => {
    await LoyalCustomer.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

app.get('/api/customers/verify/:code', async (req, res) => {
    const customer = await LoyalCustomer.findOne({ codeFidelite: req.params.code });
    if (customer) res.json({ success: true, customer });
    else res.status(404).json({ success: false });
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

// --- GESTION TIROIR CAISSE (Z-REPORT) ---
app.get('/api/tiroir/statut', verifierToken, async (req, res) => {
    try {
        const session = await CashRegister.findOne({ statut: 'ouvert' });
        res.json({ ouvert: !!session, session });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/tiroir/ouvrir', verifierToken, async (req, res) => {
    try {
        const session = new CashRegister({ fondDeCaisse: req.body.fond });
        await session.save();
        res.json({ success: true, session });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/tiroir/fermer', verifierToken, async (req, res) => {
    try {
        const session = await CashRegister.findOne({ statut: 'ouvert' });
        if (!session) return res.status(400).json({ error: "Aucune caisse ouverte" });

        // Calcule toutes les ventes en ESPÈCES depuis l'ouverture
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
    const nouveau = new Product({ ...req.body, id: Date.now() });
    await nouveau.save();
    io.emit('update_stock'); 
    res.json({ success: true, produit: nouveau });
});

app.put('/api/stock/:id', verifierToken, async (req, res) => {
    const misAJour = await Product.findOneAndUpdate({ id: req.params.id }, req.body, { new: true });
    io.emit('update_stock'); 
    res.json({ success: true, produit: misAJour });
});

app.delete('/api/stock/:id', verifierToken, async (req, res) => {
    await Product.findOneAndDelete({ id: req.params.id });
    io.emit('update_stock'); 
    res.json({ success: true });
});

app.post('/api/stock/:id/add', verifierToken, async (req, res) => {
    const p = await Product.findOne({ id: req.params.id });
    if (p) {
        const ancien = p.stock;
        p.stock += parseInt(req.body.quantite);
        await p.save();
        await new Movement({ type: 'ajout', produit: p.nom, produitId: p.id, quantite: req.body.quantite, ancienStock: ancien, nouveauStock: p.stock, raison: req.body.raison || 'Réception' }).save();
        io.emit('update_stock'); 
        res.json({ success: true });
    } else { res.status(404).send(); }
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
    res.json(await Movement.find({}).sort({ _id: -1 }).limit(100));
});

app.get('/api/stock/inventaires', verifierToken, async (req, res) => {
    res.json(await Inventory.find({}).sort({ _id: -1 }));
});

app.post('/api/stock/inventaire', verifierToken, async (req, res) => {
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
});

app.get('/api/depenses', verifierToken, async (req, res) => res.json(await Expense.find({}).sort({ _id: -1 })));
app.post('/api/depenses', verifierToken, async (req, res) => { await new Expense(req.body).save(); res.json({ success: true }); });

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

app.post('/api/ventes', verifierToken, async (req, res) => {
    try {
        const vente = new Sale(req.body);
        await vente.save();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/ventes', verifierToken, async (req, res) => {
    try {
        res.json(await Sale.find({}).sort({ timestamp: -1 }));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ========== 6. INITIALISATION DU MENU (SEED) ==========
async function seedDatabase() {
    const count = await Product.countDocuments();
    if (count === 0) {
        await Product.insertMany([
            { id: 1, nom: "Espresso", stock: 200, prix: 2.5, unite: "tasse", categorie: "cafe", seuilAlerte: 20 }
        ]);
        console.log("✅ Menu initial injecté dans MongoDB !");
    }
}

// ========== 7. DÉMARRAGE DU SERVEUR ==========
mongoose.connection.once('open', () => {
    server.listen(PORT, () => {
        console.log(`🚀 TA'BIA Coffee Shop Online !`);
        console.log(`📍 Port : ${PORT}`);
        seedDatabase();
    });
});