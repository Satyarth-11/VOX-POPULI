const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/votingapp')
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB error:', err));



const userSchema = new mongoose.Schema({
  name:         { type: String, required: true, trim: true },
  email:        { type: String, required: true, unique: true, lowercase: true },
  password:     { type: String, required: true },
  role:         { type: String, enum: ['voter', 'admin'], default: 'voter' },
  avatar:       { type: String, default: '' },
  bio:          { type: String, default: '' },
  isVerified:   { type: Boolean, default: false },
  isBanned:     { type: Boolean, default: false },
  lastLogin:    { type: Date },
  loginCount:   { type: Number, default: 0 },
  notifications:[ { message: String, read: { type: Boolean, default: false }, createdAt: { type: Date, default: Date.now } } ],
  createdAt:    { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

const candidateSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  party:       { type: String, default: '' },
  bio:         { type: String, default: '' },
  avatar:      { type: String, default: '' },
  color:       { type: String, default: '#6c63ff' },
  votes:       { type: Number, default: 0 },
  manifesto:   { type: String, default: '' }
});

const electionSchema = new mongoose.Schema({
  title:        { type: String, required: true },
  description:  { type: String, default: '' },
  category:     { type: String, enum: ['political','student','corporate','community','sports','other'], default: 'other' },
  candidates:   [candidateSchema],
  startDate:    { type: Date, required: true },
  endDate:      { type: Date, required: true },
  createdBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isActive:     { type: Boolean, default: true },
  isPublic:     { type: Boolean, default: true },
  allowedVoters:[ { type: mongoose.Schema.Types.ObjectId, ref: 'User' } ],
  banner:       { type: String, default: '' },
  tags:         [String],
  viewCount:    { type: Number, default: 0 },
  featured:     { type: Boolean, default: false },
  createdAt:    { type: Date, default: Date.now }
});
const Election = mongoose.model('Election', electionSchema);

const voteSchema = new mongoose.Schema({
  user:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  election:     { type: mongoose.Schema.Types.ObjectId, ref: 'Election', required: true },
  candidateId:  { type: mongoose.Schema.Types.ObjectId, required: true },
  createdAt:    { type: Date, default: Date.now }
});
voteSchema.index({ user: 1, election: 1 }, { unique: true });
const Vote = mongoose.model('Vote', voteSchema);

const commentSchema = new mongoose.Schema({
  election:   { type: mongoose.Schema.Types.ObjectId, ref: 'Election', required: true },
  user:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text:       { type: String, required: true, maxlength: 500 },
  likes:      [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdAt:  { type: Date, default: Date.now }
});
const Comment = mongoose.model('Comment', commentSchema);

const activitySchema = new mongoose.Schema({
  user:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  action:   { type: String },
  details:  { type: String },
  ip:       { type: String },
  createdAt:{ type: Date, default: Date.now }
});
const Activity = mongoose.model('Activity', activitySchema);



const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token' });
  try { req.user = jwt.verify(token, process.env.JWT_SECRET || 'secret123'); next(); }
  catch { res.status(401).json({ message: 'Invalid token' }); }
};

const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin only' });
  next();
};

const logActivity = async (userId, action, details, ip = '') => {
  try { await Activity.create({ user: userId, action, details, ip }); } catch {}
};



app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: 'All fields required' });
    if (password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' });
    if (await User.findOne({ email })) return res.status(400).json({ message: 'Email already registered' });
    const hashed = await bcrypt.hash(password, 12);
    const user = await User.create({ name, email, password: hashed, role: role || 'voter' });
    const token = jwt.sign({ id: user._id, role: user.role, name: user.name, email: user.email }, process.env.JWT_SECRET || 'secret123', { expiresIn: '30d' });
    await logActivity(user._id, 'register', `New ${user.role} registered`);
    res.status(201).json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role, avatar: user.avatar, bio: user.bio } });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) return res.status(400).json({ message: 'Invalid credentials' });
    if (user.isBanned) return res.status(403).json({ message: 'Account suspended. Contact admin.' });
    user.lastLogin = new Date(); user.loginCount += 1; await user.save();
    const token = jwt.sign({ id: user._id, role: user.role, name: user.name, email: user.email }, process.env.JWT_SECRET || 'secret123', { expiresIn: '30d' });
    await logActivity(user._id, 'login', 'User logged in');
    res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role, avatar: user.avatar, bio: user.bio, isVerified: user.isVerified } });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get('/api/auth/me', auth, async (req, res) => {
  const user = await User.findById(req.user.id).select('-password');
  const voteCount = await Vote.countDocuments({ user: req.user.id });
  res.json({ ...user.toObject(), voteCount });
});

app.put('/api/auth/profile', auth, async (req, res) => {
  try {
    const { name, bio, avatar } = req.body;
    const user = await User.findByIdAndUpdate(req.user.id, { name, bio, avatar }, { new: true }).select('-password');
    res.json(user);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.put('/api/auth/change-password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id);
    if (!(await bcrypt.compare(currentPassword, user.password))) return res.status(400).json({ message: 'Current password is incorrect' });
    user.password = await bcrypt.hash(newPassword, 12);
    await user.save();
    res.json({ message: 'Password changed successfully' });
  } catch (e) { res.status(500).json({ message: e.message }); }
});


app.get('/api/elections', auth, async (req, res) => {
  try {
    const { category, search, status, sort = '-createdAt' } = req.query;
    let query = { isActive: true };
    if (category && category !== 'all') query.category = category;
    if (search) query.$or = [{ title: new RegExp(search, 'i') }, { description: new RegExp(search, 'i') }, { tags: { $in: [new RegExp(search, 'i')] } }];

    const now = new Date();
    if (status === 'active') query.$and = [{ startDate: { $lte: now } }, { endDate: { $gte: now } }];
    else if (status === 'upcoming') query.startDate = { $gt: now };
    else if (status === 'ended') query.endDate = { $lt: now };

    const elections = await Election.find(query).sort(sort).populate('createdBy', 'name avatar');
    const votes = await Vote.find({ user: req.user.id });
    const votedMap = {};
    votes.forEach(v => { votedMap[v.election.toString()] = v.candidateId.toString(); });

    const result = elections.map(e => ({ ...e.toObject(), hasVoted: !!votedMap[e._id.toString()], votedFor: votedMap[e._id.toString()] || null }));
    res.json(result);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get('/api/elections/featured', auth, async (req, res) => {
  try {
    const elections = await Election.find({ featured: true, isActive: true }).limit(3).populate('createdBy', 'name');
    res.json(elections);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get('/api/elections/:id', auth, async (req, res) => {
  try {
    const election = await Election.findById(req.params.id).populate('createdBy', 'name avatar');
    if (!election) return res.status(404).json({ message: 'Not found' });
    election.viewCount += 1; await election.save();
    const vote = await Vote.findOne({ user: req.user.id, election: election._id });
    const totalVotes = election.candidates.reduce((s, c) => s + c.votes, 0);
    const commentsCount = await Comment.countDocuments({ election: election._id });
    res.json({ ...election.toObject(), hasVoted: !!vote, votedFor: vote?.candidateId?.toString() || null, totalVotes, commentsCount });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/api/elections', auth, adminOnly, async (req, res) => {
  try {
    const election = await Election.create({ ...req.body, createdBy: req.user.id });
    await logActivity(req.user.id, 'create_election', `Created election: ${election.title}`);
    res.status(201).json(election);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.put('/api/elections/:id', auth, adminOnly, async (req, res) => {
  try {
    const election = await Election.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(election);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.delete('/api/elections/:id', auth, adminOnly, async (req, res) => {
  try {
    await Election.findByIdAndDelete(req.params.id);
    await Vote.deleteMany({ election: req.params.id });
    await Comment.deleteMany({ election: req.params.id });
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ══════════════════════════════════════════════
//  VOTING ROUTES
// ══════════════════════════════════════════════

app.post('/api/elections/:id/vote', auth, async (req, res) => {
  try {
    const { candidateId } = req.body;
    const election = await Election.findById(req.params.id);
    if (!election) return res.status(404).json({ message: 'Election not found' });
    const now = new Date();
    if (now < new Date(election.startDate)) return res.status(400).json({ message: 'Election has not started yet' });
    if (now > new Date(election.endDate)) return res.status(400).json({ message: 'Election has ended' });
    if (await Vote.findOne({ user: req.user.id, election: election._id })) return res.status(400).json({ message: 'Already voted' });
    const candidate = election.candidates.id(candidateId);
    if (!candidate) return res.status(400).json({ message: 'Candidate not found' });
    await Vote.create({ user: req.user.id, election: election._id, candidateId });
    candidate.votes += 1; await election.save();
    await logActivity(req.user.id, 'vote', `Voted in election: ${election.title}`);
    const totalVotes = election.candidates.reduce((s, c) => s + c.votes, 0);
    res.json({ message: 'Vote cast!', totalVotes, candidateVotes: candidate.votes });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get('/api/elections/:id/results', auth, async (req, res) => {
  try {
    const election = await Election.findById(req.params.id);
    if (!election) return res.status(404).json({ message: 'Not found' });
    const totalVotes = election.candidates.reduce((s, c) => s + c.votes, 0);
    const results = [...election.candidates]
      .sort((a, b) => b.votes - a.votes)
      .map((c, i) => ({ ...c.toObject(), rank: i + 1, percentage: totalVotes > 0 ? +((c.votes / totalVotes) * 100).toFixed(1) : 0 }));
    const voteTimeline = await Vote.aggregate([
      { $match: { election: election._id } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d %H:00', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    res.json({ election: election.title, totalVotes, results, voteTimeline, endDate: election.endDate, startDate: election.startDate });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get('/api/elections/:id/voters', auth, adminOnly, async (req, res) => {
  try {
    const votes = await Vote.find({ election: req.params.id }).populate('user', 'name email avatar').sort('-createdAt');
    res.json(votes);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ══════════════════════════════════════════════
//  COMMENTS ROUTES
// ══════════════════════════════════════════════

app.get('/api/elections/:id/comments', auth, async (req, res) => {
  try {
    const comments = await Comment.find({ election: req.params.id }).populate('user', 'name avatar role').sort('-createdAt').limit(50);
    res.json(comments);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/api/elections/:id/comments', auth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ message: 'Comment cannot be empty' });
    const comment = await Comment.create({ election: req.params.id, user: req.user.id, text: text.trim() });
    const populated = await comment.populate('user', 'name avatar role');
    res.status(201).json(populated);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/api/comments/:id/like', auth, async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id);
    const idx = comment.likes.indexOf(req.user.id);
    if (idx === -1) comment.likes.push(req.user.id);
    else comment.likes.splice(idx, 1);
    await comment.save();
    res.json({ likes: comment.likes.length });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.delete('/api/comments/:id', auth, async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id);
    if (!comment) return res.status(404).json({ message: 'Not found' });
    if (comment.user.toString() !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ message: 'Not allowed' });
    await comment.deleteOne();
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ══════════════════════════════════════════════
//  ADMIN ROUTES
// ══════════════════════════════════════════════

app.get('/api/admin/stats', auth, adminOnly, async (req, res) => {
  try {
    const now = new Date();
    const [totalUsers, totalVoters, totalAdmins, totalElections, totalVotes, totalComments,
           activeElections, recentVotes, topElections] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: 'voter' }),
      User.countDocuments({ role: 'admin' }),
      Election.countDocuments(),
      Vote.countDocuments(),
      Comment.countDocuments(),
      Election.countDocuments({ startDate: { $lte: now }, endDate: { $gte: now }, isActive: true }),
      Vote.find().sort('-createdAt').limit(10).populate('user', 'name avatar').populate('election', 'title'),
      Election.find().sort('-viewCount').limit(5).select('title viewCount candidates')
    ]);

    const votesPerDay = await Vote.aggregate([
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: -1 } }, { $limit: 14 }
    ]);

    const userGrowth = await User.aggregate([
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: -1 } }, { $limit: 14 }
    ]);

    res.json({ totalUsers, totalVoters, totalAdmins, totalElections, totalVotes, totalComments, activeElections, recentVotes, topElections, votesPerDay, userGrowth });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get('/api/admin/users', auth, adminOnly, async (req, res) => {
  try {
    const { search, role } = req.query;
    let query = {};
    if (search) query.$or = [{ name: new RegExp(search, 'i') }, { email: new RegExp(search, 'i') }];
    if (role) query.role = role;
    const users = await User.find(query).select('-password').sort('-createdAt');
    const withVotes = await Promise.all(users.map(async u => ({ ...u.toObject(), voteCount: await Vote.countDocuments({ user: u._id }) })));
    res.json(withVotes);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.put('/api/admin/users/:id', auth, adminOnly, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, req.body, { new: true }).select('-password');
    res.json(user);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.delete('/api/admin/users/:id', auth, adminOnly, async (req, res) => {
  try {
    if (req.params.id === req.user.id) return res.status(400).json({ message: 'Cannot delete yourself' });
    await User.findByIdAndDelete(req.params.id);
    await Vote.deleteMany({ user: req.params.id });
    res.json({ message: 'User deleted' });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get('/api/admin/activity', auth, adminOnly, async (req, res) => {
  try {
    const activities = await Activity.find().sort('-createdAt').limit(50).populate('user', 'name avatar');
    res.json(activities);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ══════════════════════════════════════════════
//  NOTIFICATIONS
// ══════════════════════════════════════════════

app.get('/api/notifications', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('notifications');
    res.json(user.notifications.sort((a, b) => b.createdAt - a.createdAt).slice(0, 20));
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.put('/api/notifications/read', auth, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, { $set: { 'notifications.$[].read': true } });
    res.json({ message: 'All marked as read' });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ══════════════════════════════════════════════
//  LEADERBOARD
// ══════════════════════════════════════════════

app.get('/api/leaderboard', auth, async (req, res) => {
  try {
    const topElections = await Election.find({ isActive: true })
      .sort('-viewCount')
      .limit(10)
      .select('title candidates viewCount endDate startDate category');
    const enriched = topElections.map(e => ({
      ...e.toObject(),
      totalVotes: e.candidates.reduce((s, c) => s + c.votes, 0),
      leader: [...e.candidates].sort((a, b) => b.votes - a.votes)[0] || null
    }));
    res.json(enriched);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ══════════════════════════════════════════════
//  START
// ══════════════════════════════════════════════

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(` Server running on port ${PORT}`));
