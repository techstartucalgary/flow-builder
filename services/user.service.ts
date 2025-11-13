/**
 * User Service
 * Handles user-related API calls
 */

import { apiService } from './api.service';
import { supabase } from '@/lib/supabase';

export interface UserProfileData {
  id: string;
  email: string;
  created_at: string;
}

export interface UpdateProfileData {
  name?: string;
  avatar?: string;
  [key: string]: any;
}

class UserService {
  async getProfile(): Promise<UserProfileData> {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.access_token) {
      throw new Error('No active session');
    }

    return apiService.get<UserProfileData>(
      '/user/profile',
      session.access_token
    );
  }

  async updateProfile(updates: UpdateProfileData): Promise<any> {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.access_token) {
      throw new Error('No active session');
    }

    return apiService.patch(
      '/user/profile',
      updates,
      session.access_token
    );
  }

  async deleteAccount(): Promise<void> {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.access_token) {
      throw new Error('No active session');
    }

    return apiService.delete('/user/profile', session.access_token);
  }
}

export const userService = new UserService();
