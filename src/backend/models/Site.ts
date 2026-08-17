/**
 * Public website content (singleton) + admission applications from the site.
 */
import { Schema, models, model, Types } from "mongoose";

export interface ISiteBlock {
  title: string;
  text?: string;
  icon?: string;
}

export interface ISiteContent {
  brandName: string;
  tagline: string;
  heroTitle: string;
  heroSubtitle: string;
  heroCtaLabel: string;
  aboutTitle: string;
  aboutBody: string;
  features: ISiteBlock[];
  stats: ISiteBlock[];
  admissionsTitle: string;
  admissionsBody: string;
  contactTitle: string;
  contactBody: string;
  email?: string;
  phone?: string;
  address?: string;
  facebook?: string;
  showCourses: boolean;
  published: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const BlockSchema = new Schema<ISiteBlock>(
  {
    title: { type: String, required: true, trim: true },
    text: String,
    icon: String,
  },
  { _id: false }
);

const SiteContentSchema = new Schema<ISiteContent>(
  {
    brandName: { type: String, default: "Sabaq Model School" },
    tagline: { type: String, default: "Learning without limits" },
    heroTitle: { type: String, default: "Admissions are open for the new session" },
    heroSubtitle: {
      type: String,
      default:
        "On-campus and online programs across all our branches — certificates, diplomas and short courses taught by qualified teachers.",
    },
    heroCtaLabel: { type: String, default: "Apply Now" },
    aboutTitle: { type: String, default: "About our school" },
    aboutBody: {
      type: String,
      default:
        "We combine a strong academic foundation with modern distance learning so every student can study on campus or from home.",
    },
    features: {
      type: [BlockSchema],
      default: [
        { title: "Qualified teachers", text: "Experienced faculty across every subject." },
        { title: "Live & recorded classes", text: "Attend live or watch recordings anytime." },
        { title: "Multi-campus", text: "Study at the branch closest to you." },
      ],
    },
    stats: {
      type: [BlockSchema],
      default: [
        { title: "1200+", text: "Students" },
        { title: "80+", text: "Teachers" },
        { title: "40+", text: "Courses" },
      ],
    },
    admissionsTitle: { type: String, default: "Apply for admission" },
    admissionsBody: {
      type: String,
      default: "Fill the form and our admissions office will contact you within two working days.",
    },
    contactTitle: { type: String, default: "Get in touch" },
    contactBody: { type: String, default: "We are here to answer your questions." },
    email: String,
    phone: String,
    address: String,
    facebook: String,
    showCourses: { type: Boolean, default: true },
    published: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const SiteContent =
  models.SiteContent || model<ISiteContent>("SiteContent", SiteContentSchema);

export interface IAdmission {
  /** Student */
  applicantName: string;
  gender?: "male" | "female" | "other";
  dateOfBirth?: Date;
  placeOfBirth?: string;
  nationality?: string;
  religion?: string;
  bloodGroup?: string;
  /** Student CNIC or Form-B (under 18). */
  studentCnic?: string;
  previousSchool?: string;
  previousClass?: string;
  lastResult?: string;
  /** Guardian / parents */
  guardianName?: string;
  guardianRelation?: "father" | "mother" | "guardian" | "other";
  guardianCnic?: string;
  guardianPhone?: string;
  guardianEmail?: string;
  guardianOccupation?: string;
  motherName?: string;
  motherCnic?: string;
  motherPhone?: string;
  motherOccupation?: string;
  /** Contact & address */
  email?: string;
  phone: string;
  whatsapp?: string;
  address?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  /** Emergency */
  emergencyName?: string;
  emergencyPhone?: string;
  emergencyRelation?: string;
  /** Application */
  branchCode: string;
  academicYear?: string;
  interest: "school" | "course";
  classApplied?: string;
  courseId?: Types.ObjectId;
  transportRequired?: boolean;
  medicalNotes?: string;
  howHeard?: string;
  message?: string;
  declaration: boolean;
  status: "new" | "contacted" | "test" | "merit" | "waiting" | "offered" | "enrolled" | "rejected";
  createdAt: Date;
  updatedAt: Date;
}

const AdmissionSchema = new Schema<IAdmission>(
  {
    applicantName: { type: String, required: true, trim: true },
    gender: { type: String, enum: ["male", "female", "other"] },
    dateOfBirth: Date,
    placeOfBirth: String,
    nationality: { type: String, default: "Pakistani" },
    religion: String,
    bloodGroup: String,
    studentCnic: { type: String, trim: true },
    previousSchool: String,
    previousClass: String,
    lastResult: String,
    guardianName: String,
    guardianRelation: {
      type: String,
      enum: ["father", "mother", "guardian", "other"],
      default: "father",
    },
    guardianCnic: { type: String, trim: true },
    guardianPhone: String,
    guardianEmail: { type: String, lowercase: true, trim: true },
    guardianOccupation: String,
    motherName: String,
    motherCnic: { type: String, trim: true },
    motherPhone: String,
    motherOccupation: String,
    email: { type: String, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },
    whatsapp: String,
    address: String,
    city: String,
    province: String,
    postalCode: String,
    emergencyName: String,
    emergencyPhone: String,
    emergencyRelation: String,
    branchCode: { type: String, required: true, uppercase: true, trim: true },
    academicYear: String,
    interest: { type: String, enum: ["school", "course"], default: "school" },
    classApplied: String,
    courseId: { type: Schema.Types.ObjectId, ref: "Course" },
    transportRequired: { type: Boolean, default: false },
    medicalNotes: String,
    howHeard: String,
    message: String,
    declaration: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["new", "contacted", "test", "merit", "waiting", "offered", "enrolled", "rejected"],
      default: "new",
    },
  },
  { timestamps: true }
);

export const Admission = models.Admission || model<IAdmission>("Admission", AdmissionSchema);
