export interface DemoCase {
  label: string
  description: string
  formData: {
    age: string
    biologicalSex: string
    primaryConcern: string
    patientHypothesis: string
    noIdea: boolean
    bodyRegions: string[]
    severity: number
  }
}

export const DEMO_CASES: DemoCase[] = [
  {
    label: "Woman, 36 — chronic fatigue, joint pain, and skin issues",
    description: "Hypermobility, easy bruising, and overwhelming exhaustion",
    formData: {
      age: "36",
      biologicalSex: "female",
      primaryConcern:
        "For the past few years I've been dealing with constant exhaustion that sleep doesn't fix. My joints are really hypermobile — I can bend my fingers way back and my knees hyperextend. I get frequent joint subluxations, especially in my shoulders and fingers. My skin bruises incredibly easily, sometimes from just leaning on something, and I have these weird stretchy patches of skin on my arms. I also get dizzy when I stand up quickly, and my heart races for no reason sometimes. The fatigue has gotten so bad that I had to cut back my work hours. I've seen multiple doctors and they keep telling me it's just anxiety.",
      patientHypothesis:
        "I read about Ehlers-Danlos syndrome and a lot of it sounds like me, especially the hypermobility and skin issues.",
      noIdea: false,
      bodyRegions: ["muscles", "skin", "whole"],
      severity: 7,
    },
  },
  {
    label: "Man, 52 — progressive numbness and vision changes",
    description: "Tingling extremities, blurred vision, and balance problems",
    formData: {
      age: "52",
      biologicalSex: "male",
      primaryConcern:
        "About eight months ago I started getting tingling and numbness in my feet, which has slowly crept up to my calves. A few months later my vision started getting blurry — my eye doctor said something about optic nerve issues but wasn't sure what was causing it. I've also noticed my balance is off, especially in the dark or with my eyes closed. I stumble more often and my handwriting has gotten much worse. I occasionally get these electric shock-like sensations down my spine when I bend my neck forward. My wife says I seem more forgetful lately, but I think I'm just tired from not sleeping well because of the tingling.",
      patientHypothesis: "",
      noIdea: true,
      bodyRegions: ["head", "muscles"],
      severity: 6,
    },
  },
  {
    label: "Teen, 16 — recurring fevers and rashes",
    description: "Periodic high fevers, joint swelling, and salmon-colored rash",
    formData: {
      age: "16",
      biologicalSex: "female",
      primaryConcern:
        "Every few weeks I get these episodes where my temperature spikes to 103-104°F and I feel absolutely terrible. The fevers last about 3-5 days then go away on their own. During the episodes I get a salmon-pink rash on my trunk and thighs that comes and goes with the fever — it's worse in the evening. My knees and wrists swell up and hurt so much I can barely move them. Between episodes I feel mostly okay but never quite 100%. I've had bloodwork done and my inflammatory markers are always high, even between flares. This has been going on for about a year now. My pediatrician thought it was recurring infections at first but antibiotics never helped.",
      patientHypothesis:
        "My mom read about autoinflammatory conditions and thinks it could be something like that.",
      noIdea: false,
      bodyRegions: ["skin", "muscles", "whole"],
      severity: 7,
    },
  },
  {
    label: "Woman, 45 — digestive problems and unexplained weight loss",
    description: "Chronic diarrhea, abdominal pain, and malabsorption signs",
    formData: {
      age: "45",
      biologicalSex: "female",
      primaryConcern:
        "I've lost about 20 pounds over the past six months without trying, and I'm having terrible digestive issues. I get watery diarrhea multiple times a day, sometimes with visible oil or fat floating in the toilet. My abdomen bloats painfully after eating, and I get cramping in the upper part of my stomach. I've also noticed my hair is thinning and my nails have become very brittle. I bruise more easily than I used to, and I had a blood test that showed I'm low in iron, vitamin D, and B12 despite eating a normal diet. I also get tingling in my hands and feet sometimes. My doctor tested me for celiac disease but it came back negative.",
      patientHypothesis:
        "I wonder if it could be some other kind of malabsorption problem since my body doesn't seem to be absorbing nutrients properly.",
      noIdea: false,
      bodyRegions: ["digestive", "whole"],
      severity: 7,
    },
  },
  {
    label: "Man, 68 — shortness of breath and muscle weakness",
    description: "Exertional breathlessness, proximal weakness, and skin changes",
    formData: {
      age: "68",
      biologicalSex: "male",
      primaryConcern:
        "Over the past several months I've had increasing trouble breathing during activities that used to be easy — walking upstairs, carrying groceries, even getting up from a chair. My thigh and upper arm muscles feel weak, and I have a hard time lifting my arms above my head to get things from shelves. I've also developed a purplish discoloration on my eyelids and rough, reddish patches on my knuckles. Sometimes I have trouble swallowing, especially with solid foods — I have to take smaller bites and chew more carefully. I also get muscle aches that aren't related to exercise. My family doctor initially thought it was just aging but my symptoms keep getting worse.",
      patientHypothesis: "",
      noIdea: true,
      bodyRegions: ["chest", "muscles", "whole"],
      severity: 6,
    },
  },
]
