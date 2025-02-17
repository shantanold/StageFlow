import { supabase } from './supabase';
import { toast } from 'react-hot-toast';

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    toast.error(error.message);
    throw error;
  }

  toast.success('Signed in successfully');
}

export async function signUp(email: string, password: string) {
  const { error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    toast.error(error.message);
    throw error;
  }

  toast.success('Account created successfully');
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  
  if (error) {
    toast.error(error.message);
    throw error;
  }

  toast.success('Signed out successfully');
}