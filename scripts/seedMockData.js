require('dotenv').config();
const mongoose = require('mongoose');

const User = require('../models/User');
const Club = require('../models/Club');
const Event = require('../models/Event');

const MOCK_EMAILS = [
  'admin.mock@campusconnect.dev',
  'staff.mock@campusconnect.dev',
  'staff.events@campusconnect.dev',
  'staff.culture@campusconnect.dev',
  'student.mock@campusconnect.dev',
  'student.tech@campusconnect.dev',
  'student.sports@campusconnect.dev',
  'student.culture@campusconnect.dev'
];

const MOCK_CLUB_NAMES = [
  'CreateX Builders Club',
  'Campus Sports League',
  'Culture Collective'
];

const MOCK_EVENT_TITLES = [
  'CreateX Demo Day',
  'AI Sprint Workshop',
  'Campus Football Cup',
  'Culture Night 2026',
  'Resume Review Sprint',
  'Research Poster Showcase',
  'Street Play Workshop'
];

const baseDate = new Date();

const daysFromNow = (days, hour = 10, minute = 0) => {
  const date = new Date(baseDate);
  date.setDate(date.getDate() + days);
  date.setHours(hour, minute, 0, 0);
  return date;
};

const connectDB = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
};

const upsertUser = async (payload) => {
  let user = await User.findOne({ email: payload.email });

  if (!user) {
    user = new User(payload);
  } else {
    user.username = payload.username;
    user.name = payload.name;
    user.collegeName = payload.collegeName;
    user.userType = payload.userType;
    user.state = payload.state;
    user.city = payload.city;
    user.interests = payload.interests;
    user.emailVerified = true;
    user.passwordHash = payload.passwordHash;
  }

  user.emailVerified = true;
  user.verificationToken = null;
  user.verificationTokenExpiry = null;
  user.passwordResetToken = null;
  user.passwordResetExpiry = null;

  await user.save();
  return user;
};

const upsertClub = async (payload) => {
  let club = await Club.findOne({ name: payload.name });

  if (!club) {
    club = new Club(payload);
  } else {
    club.set(payload);
  }

  await club.save();
  return club;
};

const upsertEvent = async (payload) => {
  let event = await Event.findOne({ title: payload.title });

  if (!event) {
    event = new Event(payload);
  } else {
    event.set(payload);
  }

  await event.save();
  return event;
};

const seed = async () => {
  await connectDB();

  await User.deleteMany({ email: { $in: MOCK_EMAILS } });
  await Club.deleteMany({ name: { $in: MOCK_CLUB_NAMES } });
  await Event.deleteMany({ title: { $in: MOCK_EVENT_TITLES } });

  const adminUser = await upsertUser({
    email: 'admin.mock@campusconnect.dev',
    username: 'mock_admin',
    passwordHash: 'MockAdmin@123',
    name: 'Mock Admin',
    collegeName: 'CampusConnect Demo University',
    userType: 'admin',
    state: 'Karnataka',
    city: 'Bengaluru',
    interests: ['tech', 'career']
  });

  const staffUser = await upsertUser({
    email: 'staff.mock@campusconnect.dev',
    username: 'mock_staff',
    passwordHash: 'MockStaff@123',
    name: 'Mock Staff',
    collegeName: 'CampusConnect Demo University',
    userType: 'staff',
    state: 'Karnataka',
    city: 'Bengaluru',
    interests: ['tech', 'sports', 'workshop']
  });

  const staffEventsUser = await upsertUser({
    email: 'staff.events@campusconnect.dev',
    username: 'mock_staff_events',
    passwordHash: 'MockStaffEvents@123',
    name: 'Mock Events Staff',
    collegeName: 'CampusConnect Demo University',
    userType: 'staff',
    state: 'Telangana',
    city: 'Hyderabad',
    interests: ['career', 'academic', 'tech']
  });

  const staffCultureUser = await upsertUser({
    email: 'staff.culture@campusconnect.dev',
    username: 'mock_staff_culture',
    passwordHash: 'MockStaffCulture@123',
    name: 'Mock Culture Staff',
    collegeName: 'CampusConnect Demo University',
    userType: 'staff',
    state: 'Tamil Nadu',
    city: 'Chennai',
    interests: ['cultural', 'arts', 'social']
  });

  const studentUser = await upsertUser({
    email: 'student.mock@campusconnect.dev',
    username: 'mock_student',
    passwordHash: 'MockStudent@123',
    name: 'Mock Student',
    collegeName: 'CampusConnect Demo University',
    userType: 'student',
    state: 'Karnataka',
    city: 'Bengaluru',
    interests: ['tech', 'cultural', 'sports']
  });

  const studentTechUser = await upsertUser({
    email: 'student.tech@campusconnect.dev',
    username: 'mock_student_tech',
    passwordHash: 'MockStudentTech@123',
    name: 'Mock Tech Student',
    collegeName: 'CampusConnect Demo University',
    userType: 'student',
    state: 'Andhra Pradesh',
    city: 'Vijayawada',
    interests: ['tech', 'career', 'workshop']
  });

  const studentSportsUser = await upsertUser({
    email: 'student.sports@campusconnect.dev',
    username: 'mock_student_sports',
    passwordHash: 'MockStudentSports@123',
    name: 'Mock Sports Student',
    collegeName: 'CampusConnect Demo University',
    userType: 'student',
    state: 'Kerala',
    city: 'Kochi',
    interests: ['sports', 'fitness', 'social']
  });

  const studentCultureUser = await upsertUser({
    email: 'student.culture@campusconnect.dev',
    username: 'mock_student_culture',
    passwordHash: 'MockStudentCulture@123',
    name: 'Mock Culture Student',
    collegeName: 'CampusConnect Demo University',
    userType: 'student',
    state: 'Maharashtra',
    city: 'Pune',
    interests: ['cultural', 'arts', 'music']
  });

  const techClub = await upsertClub({
    name: 'CreateX Builders Club',
    description: 'A student club for builders, developers, startup enthusiasts, and product makers.',
    category: 'tech',
    tags: ['tech', 'startup', 'build'],
    members: [staffUser._id, staffEventsUser._id, studentUser._id, studentTechUser._id],
    memberCount: 4,
    adminId: staffUser._id,
    adminName: staffUser.name,
    meetingLocation: 'Innovation Lab, Block A',
    meetingSchedule: 'Every Wednesday at 5:30 PM',
    contactEmail: 'createx@campusconnect.dev',
    department: 'CSE',
    clubHead: 'Mock Staff',
    status: 'active'
  });

  const sportsClub = await upsertClub({
    name: 'Campus Sports League',
    description: 'A sports community that organizes tournaments, practice sessions, and fitness events.',
    category: 'sports',
    tags: ['sports', 'fitness', 'tournament'],
    members: [staffUser._id, studentUser._id, studentSportsUser._id],
    memberCount: 3,
    adminId: staffUser._id,
    adminName: staffUser.name,
    meetingLocation: 'Main Sports Ground',
    meetingSchedule: 'Every Friday at 6:00 AM',
    contactEmail: 'sports@campusconnect.dev',
    department: 'Sports',
    clubHead: 'Mock Staff',
    status: 'active'
  });

  const culturalClub = await upsertClub({
    name: 'Culture Collective',
    description: 'A creative club for music, dance, theatre, and campus festival experiences.',
    category: 'cultural',
    tags: ['culture', 'music', 'dance'],
    members: [staffCultureUser._id, studentUser._id, studentCultureUser._id],
    memberCount: 3,
    adminId: staffCultureUser._id,
    adminName: staffCultureUser.name,
    meetingLocation: 'Auditorium Green Room',
    meetingSchedule: 'Every Saturday at 4:00 PM',
    contactEmail: 'culture@campusconnect.dev',
    department: 'Arts',
    clubHead: 'Mock Culture Staff',
    status: 'active'
  });

  const createdEvents = [];

  createdEvents.push(await upsertEvent({
    title: 'CreateX Demo Day',
    description: 'Pitch your startup ideas, showcase prototypes, and meet fellow builders from across campus.',
    category: 'tech',
    tags: ['startup', 'pitch', 'demo'],
    startDate: daysFromNow(2, 15, 0),
    endDate: daysFromNow(2, 18, 0),
    location: 'Innovation Hall',
    organizerId: staffUser._id,
    organizerName: staffUser.name,
    slotLimit: 120,
    price: 0,
    registeredUsers: [studentUser._id, studentTechUser._id],
    registrationCount: 2,
    verificationStatus: 'approved',
    isPublished: true,
    adminApproved: true,
    clubId: techClub._id,
    clubName: techClub.name,
    creditType: 'experimental elective',
    creditValue: 1
  }));

  createdEvents.push(await upsertEvent({
    title: 'AI Sprint Workshop',
    description: 'A hands-on workshop covering prompt design, rapid prototyping, and AI app demos for students.',
    category: 'workshop',
    tags: ['ai', 'workshop', 'prompting'],
    startDate: daysFromNow(4, 11, 0),
    endDate: daysFromNow(4, 14, 0),
    location: 'Lab 204',
    organizerId: staffUser._id,
    organizerName: staffUser.name,
    slotLimit: 80,
    price: 199,
    isPaid: true,
    paymentUrl: '/payments/mock',
    paymentInstructions: 'Complete the RuPay payment and keep the transaction reference ready for confirmation.',
    registeredUsers: [studentTechUser._id],
    registrationCount: 1,
    verificationStatus: 'approved',
    isPublished: true,
    adminApproved: true,
    clubId: techClub._id,
    clubName: techClub.name,
    creditType: 'universal elective',
    creditValue: 1
  }));

  createdEvents.push(await upsertEvent({
    title: 'Campus Football Cup',
    description: 'Join the annual inter-department football tournament and represent your team on the main ground.',
    category: 'sports',
    tags: ['football', 'sports', 'tournament'],
    startDate: daysFromNow(6, 7, 0),
    endDate: daysFromNow(6, 12, 0),
    location: 'Main Sports Ground',
    organizerId: staffUser._id,
    organizerName: staffUser.name,
    slotLimit: 150,
    price: 0,
    registeredUsers: [studentUser._id, studentSportsUser._id],
    registrationCount: 2,
    verificationStatus: 'approved',
    isPublished: true,
    adminApproved: true,
    clubId: sportsClub._id,
    clubName: sportsClub.name,
    creditType: 'group1',
    creditValue: 1
  }));

  createdEvents.push(await upsertEvent({
    title: 'Culture Night 2026',
    description: 'An evening of music, dance, theatre, and student performances celebrating campus creativity.',
    category: 'cultural',
    tags: ['music', 'dance', 'festival'],
    startDate: daysFromNow(8, 17, 0),
    endDate: daysFromNow(8, 21, 0),
    location: 'Open Air Theatre',
    organizerId: staffCultureUser._id,
    organizerName: staffCultureUser.name,
    slotLimit: 300,
    price: 99,
    isPaid: true,
    paymentUrl: '/payments/mock',
    paymentInstructions: 'Use the RuPay payment page and then submit the transaction ID in CampusConnect.',
    registeredUsers: [studentCultureUser._id, studentUser._id],
    registrationCount: 2,
    verificationStatus: 'approved',
    isPublished: true,
    adminApproved: true,
    clubId: culturalClub._id,
    clubName: culturalClub.name,
    creditType: 'group2',
    creditValue: 1
  }));

  createdEvents.push(await upsertEvent({
    title: 'Resume Review Sprint',
    description: 'A focused career clinic where students get rapid feedback on resumes, LinkedIn profiles, and internship applications.',
    category: 'career',
    tags: ['career', 'resume', 'internship'],
    startDate: daysFromNow(10, 14, 0),
    endDate: daysFromNow(10, 17, 0),
    location: 'Placement Cell Conference Room',
    organizerId: staffEventsUser._id,
    organizerName: staffEventsUser.name,
    slotLimit: 60,
    price: 0,
    registeredUsers: [studentTechUser._id, studentUser._id],
    registrationCount: 2,
    verificationStatus: 'approved',
    isPublished: true,
    adminApproved: true,
    clubId: techClub._id,
    clubName: techClub.name,
    creditType: 'core',
    creditValue: 1
  }));

  createdEvents.push(await upsertEvent({
    title: 'Research Poster Showcase',
    description: 'Students present poster abstracts on AI, sustainability, electronics, and interdisciplinary research to faculty and peers.',
    category: 'academic',
    tags: ['research', 'poster', 'academic'],
    startDate: daysFromNow(12, 10, 0),
    endDate: daysFromNow(12, 15, 0),
    location: 'Central Library Foyer',
    organizerId: staffEventsUser._id,
    organizerName: staffEventsUser.name,
    slotLimit: 90,
    price: 0,
    registeredUsers: [studentTechUser._id],
    registrationCount: 1,
    verificationStatus: 'approved',
    isPublished: true,
    adminApproved: true,
    creditType: 'experimental elective',
    creditValue: 2
  }));

  createdEvents.push(await upsertEvent({
    title: 'Street Play Workshop',
    description: 'A theatre and performance workshop focused on scripting, voice work, and collaborative stage movement for campus performers.',
    category: 'workshop',
    tags: ['theatre', 'workshop', 'performance'],
    startDate: daysFromNow(14, 16, 0),
    endDate: daysFromNow(14, 19, 0),
    location: 'Open Air Theatre Rehearsal Space',
    organizerId: staffCultureUser._id,
    organizerName: staffCultureUser.name,
    slotLimit: 50,
    price: 49,
    isPaid: true,
    paymentUrl: '/payments/mock',
    paymentInstructions: 'Pay on the mock RuPay page, then paste the generated transaction reference back in CampusConnect.',
    registeredUsers: [studentCultureUser._id],
    registrationCount: 1,
    verificationStatus: 'approved',
    isPublished: true,
    adminApproved: true,
    clubId: culturalClub._id,
    clubName: culturalClub.name,
    creditType: 'group3',
    creditValue: 1
  }));

  await User.findByIdAndUpdate(staffUser._id, {
    joinedClubs: [techClub._id, sportsClub._id],
    joinedEvents: [],
    eventAttendanceCount: 0
  });

  await User.findByIdAndUpdate(staffEventsUser._id, {
    joinedClubs: [techClub._id],
    joinedEvents: [],
    eventAttendanceCount: 0
  });

  await User.findByIdAndUpdate(staffCultureUser._id, {
    joinedClubs: [culturalClub._id],
    joinedEvents: [],
    eventAttendanceCount: 0
  });

  await User.findByIdAndUpdate(studentUser._id, {
    joinedClubs: [techClub._id, sportsClub._id, culturalClub._id],
    joinedEvents: [createdEvents[0]._id, createdEvents[2]._id, createdEvents[3]._id, createdEvents[4]._id],
    eventAttendanceCount: 4,
    credits: {
      total: 3,
      experimental: 1,
      universal: 0,
      core: 1,
      group1: 1,
      group2: 0,
      group3: 0
    }
  });

  await User.findByIdAndUpdate(studentTechUser._id, {
    joinedClubs: [techClub._id],
    joinedEvents: [createdEvents[0]._id, createdEvents[1]._id, createdEvents[4]._id, createdEvents[5]._id],
    eventAttendanceCount: 4,
    credits: {
      total: 4,
      experimental: 2,
      universal: 1,
      core: 1,
      group1: 0,
      group2: 0,
      group3: 0
    }
  });

  await User.findByIdAndUpdate(studentSportsUser._id, {
    joinedClubs: [sportsClub._id],
    joinedEvents: [createdEvents[2]._id],
    eventAttendanceCount: 1,
    credits: {
      total: 1,
      experimental: 0,
      universal: 0,
      core: 0,
      group1: 1,
      group2: 0,
      group3: 0
    }
  });

  await User.findByIdAndUpdate(studentCultureUser._id, {
    joinedClubs: [culturalClub._id],
    joinedEvents: [createdEvents[3]._id, createdEvents[6]._id],
    eventAttendanceCount: 2,
    credits: {
      total: 2,
      experimental: 0,
      universal: 0,
      core: 0,
      group1: 0,
      group2: 1,
      group3: 1
    }
  });

  console.log('Mock data seeded successfully.');
  console.log('Users:', MOCK_EMAILS.join(', '));
  console.log('Clubs:', MOCK_CLUB_NAMES.join(', '));
  console.log('Events:', MOCK_EVENT_TITLES.join(', '));
};

seed()
  .catch((error) => {
    console.error('Failed to seed mock data:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
  });
