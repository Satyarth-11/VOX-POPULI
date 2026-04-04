

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/votingapp');

const userSchema = new mongoose.Schema({ name:String, email:String, password:String, role:String, isVerified:Boolean, loginCount:{type:Number,default:0} });
const candidateSchema = new mongoose.Schema({ name:String, party:String, bio:String, color:String, votes:{type:Number,default:0} });
const electionSchema = new mongoose.Schema({ title:String, description:String, category:String, candidates:[candidateSchema], startDate:Date, endDate:Date, createdBy:mongoose.Schema.Types.ObjectId, isActive:{type:Boolean,default:true}, isPublic:{type:Boolean,default:true}, tags:[String], viewCount:{type:Number,default:0}, featured:{type:Boolean,default:false} });

const User = mongoose.model('User', userSchema);
const Election = mongoose.model('Election', electionSchema);

async function seed() {
  await User.deleteMany({});
  await Election.deleteMany({});

  const adminPw = await bcrypt.hash('admin123', 12);
  const voterPw = await bcrypt.hash('voter123', 12);

  const admin = await User.create({ name: 'Admin User', email: 'admin@vox.com', password: adminPw, role: 'admin', isVerified: true });
  await User.create({ name: 'Jane Voter', email: 'voter@vox.com', password: voterPw, role: 'voter', isVerified: true });
  await User.create({ name: 'John Doe', email: 'john@vox.com', password: voterPw, role: 'voter' });

  const now = new Date();
  const inFuture = (days) => new Date(now.getTime() + days * 86400000);
  const inPast = (days) => new Date(now.getTime() - days * 86400000);

  await Election.create({
    title: 'Student Council President 2025',
    description: 'Vote for your next student council president. This election determines who will represent the student body for the coming academic year.',
    category: 'student',
    candidates: [
      { name: 'Priya Sharma', party: 'Progressive Students', bio: 'Committed to improving campus facilities and student welfare.', votes: 45 },
      { name: 'Rahul Verma', party: 'Academic Excellence', bio: 'Focus on academic resources and career opportunities.', votes: 38 },
      { name: 'Aisha Khan', party: 'Inclusive Campus', bio: 'Building a diverse and inclusive campus community.', votes: 27 },
    ],
    startDate: inPast(5), endDate: inFuture(3),
    createdBy: admin._id, tags: ['student', 'council', '2025'], viewCount: 124, featured: true
  });

  await Election.create({
    title: 'Best Tech Project Award',
    description: 'Vote for the best final year tech project presented at the annual showcase.',
    category: 'other',
    candidates: [
      { name: 'Team Alpha — AI Tutor', party: 'CS Department', bio: 'An AI-powered personalized tutoring system.', votes: 60 },
      { name: 'Team Beta — GreenTrack', party: 'Env. Science', bio: 'Carbon footprint tracker with gamification.', votes: 55 },
      { name: 'Team Gamma — MedBot', party: 'Biomedical', bio: 'Medical diagnosis assistant using ML.', votes: 41 },
    ],
    startDate: inPast(2), endDate: inFuture(5),
    createdBy: admin._id, tags: ['tech', 'awards', 'projects'], viewCount: 89, featured: false
  });

  await Election.create({
    title: 'Community Mural Design Vote',
    description: 'Help us choose the design for our new community centre mural. Your vote shapes our neighbourhood.',
    category: 'community',
    candidates: [
      { name: 'Design A: Heritage Mosaic', party: '', bio: 'Celebrates local history and cultural heritage.', votes: 120 },
      { name: 'Design B: Future Vision', party: '', bio: 'Abstract futuristic cityscape.', votes: 98 },
      { name: 'Design C: Nature Sanctuary', party: '', bio: 'Vibrant nature and wildlife scene.', votes: 85 },
    ],
    startDate: inPast(10), endDate: inPast(2),
    createdBy: admin._id, tags: ['community', 'art', 'mural'], viewCount: 310, featured: false
  });

  await Election.create({
    title: 'Corporate Employee of the Year',
    description: 'Nominate and vote for the most impactful employee of 2025.',
    category: 'corporate',
    candidates: [
      { name: 'Sunita Patel', party: 'Engineering', bio: 'Led the successful launch of 3 key products.', votes: 0 },
      { name: 'Marcus Wong', party: 'Sales', bio: 'Achieved 180% of annual sales target.', votes: 0 },
      { name: 'Divya Nair', party: 'HR & Culture', bio: 'Transformed onboarding and retention rates.', votes: 0 },
    ],
    startDate: inFuture(3), endDate: inFuture(10),
    createdBy: admin._id, tags: ['corporate', 'awards', 'HR'], viewCount: 12, featured: false
  });

  console.log('✅ Seed complete!');
  console.log('Admin: admin@vox.com / admin123');
  console.log('Voter: voter@vox.com / voter123');
  mongoose.disconnect();
}

seed().catch(console.error);
